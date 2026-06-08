// commands/updatestock.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { getStock, setStock } from '../utils/redis.js';
import { SPAWNERS, COLORS, isOwner, fmt } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('updatestock')
  .setDescription('(Owner) Update spawner stock, buy price, and sell price')
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to post/update the stock embed in (optional)')
      .setRequired(false));

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ You need the **Owner** role to use this command.', ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('updatestock:select')
    .setPlaceholder('Choose a spawner to update...')
    .addOptions(SPAWNERS.map(s => ({
      label: s.label,
      value: s.id,
      emoji: s.emoji,
    })));

  const row = new ActionRowBuilder().addComponents(menu);

  // Store channel choice in customId via a temp session approach — pass channelId in interaction reply
  const channel = interaction.options.getChannel('channel');

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🛠️ Update Stock')
        .setDescription(
          channel
            ? `Select which spawner to update. Stock embed will be posted/updated in ${channel}.`
            : 'Select which spawner to update.'
        ),
    ],
    components: [row],
    ephemeral: true,
  });

  // Store channel for this user temporarily
  if (channel) pendingChannels.set(interaction.user.id, channel.id);
}

// Temp map: userId → channelId to post stock embed in
const pendingChannels = new Map();

export async function handleSelect(interaction) {
  const spawnerId = interaction.values[0];
  const spawner   = SPAWNERS.find(s => s.id === spawnerId);
  const stock     = await getStock();
  const cur       = stock[spawnerId] || {};

  const modal = new ModalBuilder()
    .setCustomId(`updatestock:modal:${spawnerId}`)
    .setTitle(`Update ${spawner.label}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('count')
        .setLabel('Stock Count (how many you have to sell)')
        .setStyle(TextInputStyle.Short)
        .setValue(cur.count != null ? String(cur.count) : '')
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sellPrice')
        .setLabel('Sell Price (what members pay you)')
        .setStyle(TextInputStyle.Short)
        .setValue(cur.sellPrice != null ? String(cur.sellPrice) : '')
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('buyPrice')
        .setLabel('Buy Price (what you pay members)')
        .setStyle(TextInputStyle.Short)
        .setValue(cur.buyPrice != null ? String(cur.buyPrice) : '')
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('bulkPrice')
        .setLabel('Bulk Sell Price (optional, e.g. 512+ discount)')
        .setStyle(TextInputStyle.Short)
        .setValue(cur.bulkPrice != null ? String(cur.bulkPrice) : '')
        .setRequired(false)
        .setPlaceholder('Leave blank if no bulk price'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('buyCap')
        .setLabel('Buy Cap (max you buy from one person, optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(cur.buyCap != null ? String(cur.buyCap) : '')
        .setRequired(false)
        .setPlaceholder('Leave blank for unlimited'),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleModal(interaction, spawnerId) {
  const spawner   = SPAWNERS.find(s => s.id === spawnerId);
  const count     = parseInt(interaction.fields.getTextInputValue('count'));
  const sellPrice = parseInt(interaction.fields.getTextInputValue('sellPrice'));
  const buyPrice  = parseInt(interaction.fields.getTextInputValue('buyPrice'));
  const bulkRaw   = interaction.fields.getTextInputValue('bulkPrice').trim();
  const buyCap    = interaction.fields.getTextInputValue('buyCap').trim();
  const bulkPrice = bulkRaw ? parseInt(bulkRaw) : null;

  if (isNaN(count) || isNaN(sellPrice) || isNaN(buyPrice)) {
    return interaction.reply({ content: '❌ Stock count and prices must be valid numbers.', ephemeral: true });
  }

  const stock = await getStock();
  stock[spawnerId] = {
    count,
    sellPrice,
    buyPrice,
    bulkPrice,
    buyCap: buyCap ? parseInt(buyCap) : null,
    updatedAt: Date.now(),
  };
  await setStock(stock);

  await interaction.deferReply({ ephemeral: true });

  // Post/update the full stock embed if a channel was set
  const channelId = pendingChannels.get(interaction.user.id);
  if (channelId) {
    pendingChannels.delete(interaction.user.id);
    const target = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (target) await postStockEmbed(target, stock, interaction.client);
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Stock Updated')
        .addFields(
          { name: 'Spawner',    value: `${spawner.emoji} ${spawner.label}`, inline: true },
          { name: 'Stock',      value: `${fmt(count)}`,                      inline: true },
          { name: 'Sell Price', value: `$${fmt(sellPrice)} ea`,              inline: true },
          { name: 'Buy Price',  value: `$${fmt(buyPrice)} ea`,               inline: true },
          ...(bulkPrice ? [{ name: 'Bulk Price', value: `$${fmt(bulkPrice)} ea (512+)`, inline: true }] : []),
          { name: 'Buy Cap',    value: buyCap ? `${buyCap} per person` : 'Unlimited', inline: true },
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
  });
}

// ── Build and post (or edit) the stock embed ───────────────────
// We store the last posted message ID in Redis so we can edit it
import { redis } from '../utils/redis.js';

export async function postStockEmbed(channel, stock, client) {
  const { embed, row } = buildStockEmbed(stock);

  // Try to edit existing message
  const stored = await redis.get('sh:stockMsgId').catch(() => null);
  if (stored) {
    try {
      const existing = await channel.messages.fetch(stored);
      await existing.edit({ embeds: [embed], components: [row] });
      return;
    } catch {
      // Message gone, fall through to send new one
    }
  }

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await redis.set('sh:stockMsgId', msg.id);
}

function fmtPrice(n) {
  if (!n && n !== 0) return 'N/A';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.?0+$/, '')}K`;
  return String(n);
}

function buildStockEmbed(stock) {
  // ── Buying section (we buy from members) ──
  const buyingLines = SPAWNERS.map(s => {
    const d = stock[s.id];
    if (!d?.buyPrice) return null;
    const bulk = d.bulkPrice ? ` · Bulk 512+: **${fmtPrice(d.bulkPrice)} each**` : '';
    return `${s.emoji} **${s.label}s** — **${fmtPrice(d.buyPrice)} each**${bulk}`;
  }).filter(Boolean);

  // ── Selling section (we sell to members) ──
  const sellingLines = SPAWNERS.map(s => {
    const d = stock[s.id];
    if (!d?.sellPrice) return null;
    const bulk    = d.bulkPrice ? ` · Bulk 512+: **${fmtPrice(d.bulkPrice)} each**` : '';
    const stockLine = d.count != null
      ? `\n> 📦 Stock: **${fmtPrice(d.count)} spawners available**`
      : '';
    return `${s.emoji} **${s.label}s** — **${fmtPrice(d.sellPrice)} each**${bulk}${stockLine}`;
  }).filter(Boolean);

  const description = [
    '**Buying:** *(You sell to us)*',
    buyingLines.length ? buyingLines.join('\n') : '*No buy prices set yet*',
    '',
    '**Selling:** *(We sell to you)*',
    sellingLines.length ? sellingLines.join('\n') : '*No sell prices set yet*',
    '',
    '▸ **16 spawners minimum** to sell',
    '▸ We do **not** go first',
    '▸ We do **not** negotiate on prices',
    '',
    '*Open a ticket below to buy or sell spawners.*',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('🦴 Spawner Prices')
    .setDescription(description)
    .setFooter({ text: `Spawner Hub • Last updated` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stockpanel:sell')
      .setLabel('Sell Spawners')
      .setEmoji('⬆️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('stockpanel:buy')
      .setLabel('Buy Spawners')
      .setEmoji('⬇️')
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, row };
}

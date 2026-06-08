// commands/updatestock.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { getStock, setStock, redis } from '../utils/redis.js';
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

  // Show modal immediately — no Redis fetch before, Discord requires response within 3s
  // Fields will be empty but that's fine; current values aren't worth risking a timeout
  const modal = new ModalBuilder()
    .setCustomId(`updatestock:modal:${spawnerId}`)
    .setTitle(`Update ${spawner.label}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('count')
        .setLabel('Stock Count (how many you have to sell)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sellPrice')
        .setLabel('Sell Price (what members pay you)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('buyPrice')
        .setLabel('Buy Price (what you pay members)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('bulkPrice')
        .setLabel('Bulk Sell Price (optional, e.g. 512+ discount)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank if no bulk price'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('buyCap')
        .setLabel('Buy Cap (max you buy from one person, optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Leave blank for unlimited'),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleModal(interaction, spawnerId) {
  const spawner   = SPAWNERS.find(s => s.id === spawnerId);
  const count     = interaction.fields.getTextInputValue('count').trim();
  const sellPrice = interaction.fields.getTextInputValue('sellPrice').trim();
  const buyPrice  = interaction.fields.getTextInputValue('buyPrice').trim();
  const bulkRaw   = interaction.fields.getTextInputValue('bulkPrice').trim();
  const buyCap    = interaction.fields.getTextInputValue('buyCap').trim();
  const bulkPrice = bulkRaw || null;

  if (!count || !sellPrice || !buyPrice) {
    return interaction.reply({ content: '❌ Stock count and prices cannot be empty.', ephemeral: true });
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
          { name: 'Stock',      value: count,                                 inline: true },
          { name: 'Sell Price', value: `${sellPrice} ea`,                    inline: true },
          { name: 'Buy Price',  value: `${buyPrice} ea`,                     inline: true },
          ...(bulkPrice ? [{ name: 'Bulk Price', value: `${bulkPrice} ea (512+)`, inline: true }] : []),
          { name: 'Buy Cap',    value: buyCap ? `${buyCap} per person` : 'Unlimited', inline: true },
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
  });
}

// ── Build and post (or edit) the stock embed ───────────────────
// We store the last posted message ID in Redis so we can edit it

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

function buildStockEmbed(stock) {
  // ── Buying section (we buy from members) ──
  const buyingLines = SPAWNERS.map(s => {
    const d = stock[s.id];
    if (!d?.buyPrice) return null;
    const bulk = d.bulkPrice ? ` · Bulk 512+: **${d.bulkPrice} each**` : '';
    return `${s.emoji} **${s.label}s** — **${d.buyPrice} each**${bulk}`;
  }).filter(Boolean);

  // ── Selling section (we sell to members) ──
  const sellingLines = SPAWNERS.map(s => {
    const d = stock[s.id];
    if (!d?.sellPrice) return null;
    const bulk      = d.bulkPrice ? ` · Bulk 512+: **${d.bulkPrice} each**` : '';
    const stockLine = d.count ? `\n> 📦 Stock: **${d.count} spawners available**` : '';
    return `${s.emoji} **${s.label}s** — **${d.sellPrice} each**${bulk}${stockLine}`;
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

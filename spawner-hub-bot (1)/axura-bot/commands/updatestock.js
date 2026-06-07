// commands/updatestock.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getStock, setStock } from '../utils/redis.js';
import { SPAWNERS, COLORS, isOwner } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('updatestock')
  .setDescription('(Owner) Update spawner stock, buy price, and sell price');

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

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🛠️ Update Stock')
        .setDescription('Select which spawner you want to update prices & stock for.'),
    ],
    components: [row],
    ephemeral: true,
  });
}

// Called from interactionCreate event
export async function handleSelect(interaction) {
  const spawnerId = interaction.values[0];
  const spawner   = SPAWNERS.find(s => s.id === spawnerId);

  const stock = await getStock();
  const cur   = stock[spawnerId] || {};

  const modal = new ModalBuilder()
    .setCustomId(`updatestock:modal:${spawnerId}`)
    .setTitle(`Update ${spawner.label}`);

  const countInput = new TextInputBuilder()
    .setCustomId('count')
    .setLabel('Stock Count (how many you have to sell)')
    .setStyle(TextInputStyle.Short)
    .setValue(cur.count != null ? String(cur.count) : '')
    .setRequired(true);

  const sellPriceInput = new TextInputBuilder()
    .setCustomId('sellPrice')
    .setLabel('Your Sell Price (what members pay you)')
    .setStyle(TextInputStyle.Short)
    .setValue(cur.sellPrice != null ? String(cur.sellPrice) : '')
    .setRequired(true);

  const buyPriceInput = new TextInputBuilder()
    .setCustomId('buyPrice')
    .setLabel('Your Buy Price (what you pay members)')
    .setStyle(TextInputStyle.Short)
    .setValue(cur.buyPrice != null ? String(cur.buyPrice) : '')
    .setRequired(true);

  const buyCapInput = new TextInputBuilder()
    .setCustomId('buyCap')
    .setLabel('Buy Cap (max you will buy from one person)')
    .setStyle(TextInputStyle.Short)
    .setValue(cur.buyCap != null ? String(cur.buyCap) : '')
    .setRequired(false)
    .setPlaceholder('Leave blank for unlimited');

  modal.addComponents(
    new ActionRowBuilder().addComponents(countInput),
    new ActionRowBuilder().addComponents(sellPriceInput),
    new ActionRowBuilder().addComponents(buyPriceInput),
    new ActionRowBuilder().addComponents(buyCapInput),
  );

  await interaction.showModal(modal);
}

export async function handleModal(interaction, spawnerId) {
  const spawner   = SPAWNERS.find(s => s.id === spawnerId);
  const count     = parseInt(interaction.fields.getTextInputValue('count'));
  const sellPrice = parseInt(interaction.fields.getTextInputValue('sellPrice'));
  const buyPrice  = parseInt(interaction.fields.getTextInputValue('buyPrice'));
  const buyCap    = interaction.fields.getTextInputValue('buyCap');

  if (isNaN(count) || isNaN(sellPrice) || isNaN(buyPrice)) {
    return interaction.reply({ content: '❌ Stock count and prices must be valid numbers.', ephemeral: true });
  }

  const stock = await getStock();
  stock[spawnerId] = {
    count,
    sellPrice,
    buyPrice,
    buyCap: buyCap ? parseInt(buyCap) : null,
    updatedAt: Date.now(),
  };
  await setStock(stock);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Stock Updated')
        .addFields(
          { name: 'Spawner',    value: `${spawner.emoji} ${spawner.label}`, inline: true },
          { name: 'Stock',      value: `${count}`,        inline: true },
          { name: 'Sell Price', value: `$${sellPrice.toLocaleString()} ea`, inline: true },
          { name: 'Buy Price',  value: `$${buyPrice.toLocaleString()} ea`,  inline: true },
          { name: 'Buy Cap',    value: buyCap ? `${buyCap} per person` : 'Unlimited', inline: true },
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}

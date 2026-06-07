// commands/stock.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStock } from '../utils/redis.js';
import { SPAWNERS, COLORS, fmt } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('stock')
  .setDescription('View current spawner stock, buy & sell prices');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true }); // only visible to caller — no clutter

  const stock = await getStock();

  const fields = SPAWNERS.map(s => {
    const d = stock[s.id];
    if (!d) return {
      name: `${s.emoji} ${s.label}`,
      value: '```\nNo data yet\n```',
      inline: true,
    };

    const stockLine  = d.count   != null ? `📦 Stock   : ${fmt(d.count)}` : '📦 Stock   : N/A';
    const buyLine    = d.buyPrice  != null ? `🟢 We Buy  : $${fmt(d.buyPrice)} ea` : '🟢 We Buy  : N/A';
    const sellLine   = d.sellPrice != null ? `🔴 We Sell : $${fmt(d.sellPrice)} ea` : '🔴 We Sell : N/A';

    return {
      name: `${s.emoji} ${s.label}`,
      value: `\`\`\`\n${stockLine}\n${buyLine}\n${sellLine}\n\`\`\``,
      inline: true,
    };
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.accent)
    .setTitle('🦴 Spawner Hub — Spawner Stock')
    .setDescription('> Live prices for buying and selling spawners.\n> Open a ticket to trade!')
    .addFields(fields)
    .setFooter({ text: 'Spawner Hub • DonutSMP • Prices update live' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

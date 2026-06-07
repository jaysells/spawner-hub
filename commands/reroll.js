// commands/reroll.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import { getRecentEndedGiveaways, getGiveaway, saveGiveaway } from '../utils/redis.js';
import { COLORS, isOwner } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('reroll')
  .setDescription('(Owner) Reroll a recently ended giveaway');

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }

  const ended = await getRecentEndedGiveaways(10);
  if (ended.length === 0) {
    return interaction.reply({ content: '❌ No recently ended giveaways found.', ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('reroll:select')
    .setPlaceholder('Choose a giveaway to reroll...')
    .addOptions(ended.map(g => ({
      label: g.prize.slice(0, 100),
      description: `Winner: ${g.winner ? `<@${g.winner}>` : 'None'} • ${new Date(g.endedAt).toLocaleDateString()}`,
      value: g.id,
    })));

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🎲 Reroll Giveaway')
        .setDescription('Select which giveaway to reroll.'),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

export async function handleRerollSelect(interaction) {
  const giveawayId = interaction.values[0];
  const giveaway   = await getGiveaway(giveawayId);

  if (!giveaway || giveaway.entries.length === 0) {
    return interaction.reply({ content: '❌ No entries to reroll from.', ephemeral: true });
  }

  // Exclude previous winner if possible
  const pool = giveaway.entries.filter(id => id !== giveaway.winner);
  const finalPool = pool.length > 0 ? pool : giveaway.entries;
  const newWinner = finalPool[Math.floor(Math.random() * finalPool.length)];

  await saveGiveaway({ ...giveaway, winner: newWinner });

  const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(COLORS.accent)
    .setTitle('🎲 Giveaway Rerolled!')
    .setDescription(
      `**Prize:** ${giveaway.prize}\n\n🏆 **New Winner:** <@${newWinner}>\n\nCongratulations! Open a **Giveaway Claim** ticket.`,
    )
    .setFooter({ text: `Rerolled by ${interaction.user.tag}` })
    .setTimestamp();

  if (channel) {
    await channel.send({ embeds: [embed] });
    await channel.send(`🎲 Reroll! Congratulations <@${newWinner}>! You won **${giveaway.prize}**!`);
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Rerolled')
        .setDescription(`New winner: <@${newWinner}>`),
    ],
    components: [],
  });
}

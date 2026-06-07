// commands/ticket.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { COLORS, isOwner } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('(Owner) Post the ticket panel in this channel');

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🦴 Spawner Hub — Open a Ticket')
    .setDescription(
      '**Choose the type of ticket you need below.**\n\n' +
      '🟢 **Trade** — Buy or sell spawners\n' +
      '🎉 **Giveaway Claim** — Claim your giveaway prize\n' +
      '⛏️ **Digging Service** — Request digging\n' +
      '🆘 **Support** — General help\n\n' +
      '*Tickets are private — only you and staff can see them.*',
    )
    .setFooter({ text: 'Spawner Hub • DonutSMP' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:trade')
      .setLabel('Trade')
      .setEmoji('🦴')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket:giveaway')
      .setLabel('Giveaway Claim')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket:digging')
      .setLabel('Digging Service')
      .setEmoji('⛏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:support')
      .setLabel('Support')
      .setEmoji('🆘')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Ticket panel posted!', ephemeral: true });
}

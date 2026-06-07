// commands/ban.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { COLORS, isOwner } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('(Owner) Ban a user from the server');

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('ban:modal')
    .setTitle('Ban User');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('userId')
        .setLabel('User ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Right-click user → Copy User ID')
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Leave blank for no reason')
        .setRequired(false),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleModal(interaction) {
  const userId = interaction.fields.getTextInputValue('userId').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim() || 'No reason provided';

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  let target;
  try {
    target = await guild.members.fetch(userId);
  } catch {
    try {
      target = await interaction.client.users.fetch(userId);
    } catch {
      return interaction.editReply({ content: '❌ Could not find that user.' });
    }
  }

  const user = target.user ?? target;

  // DM the user before banning
  const dmEmbed = new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle('🔨 The ban hammer has spoken')
    .addFields(
      { name: 'Punishment', value: '**Ban**', inline: true },
      { name: 'By',         value: `${interaction.user.username}`, inline: true },
      { name: 'Reason',     value: reason },
    )
    .setTimestamp();

  await user.send({ embeds: [dmEmbed] }).catch(() => {});

  try {
    await guild.members.ban(userId, { reason });
  } catch {
    return interaction.editReply({ content: '❌ Failed to ban. Do I have ban permissions?' });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('🔨 Banned')
        .addFields(
          { name: 'User',   value: `${user.tag} (${userId})`, inline: true },
          { name: 'By',     value: interaction.user.username,  inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp(),
    ],
  });
}

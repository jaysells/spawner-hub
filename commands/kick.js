// commands/kick.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { COLORS, isOwner } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('(Owner) Kick a user from the server');

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('kick:modal')
    .setTitle('Kick User');

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

  let member;
  try {
    member = await interaction.guild.members.fetch(userId);
  } catch {
    return interaction.editReply({ content: '❌ Could not find that user in this server.' });
  }

  const dmEmbed = new EmbedBuilder()
    .setColor(COLORS.accent)
    .setTitle('🔨 The ban hammer has spoken')
    .addFields(
      { name: 'Punishment', value: '**Kick**', inline: true },
      { name: 'By',         value: `${interaction.user.username}`, inline: true },
      { name: 'Reason',     value: reason },
    )
    .setTimestamp();

  await member.user.send({ embeds: [dmEmbed] }).catch(() => {});

  try {
    await member.kick(reason);
  } catch {
    return interaction.editReply({ content: '❌ Failed to kick. Do I have kick permissions?' });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle('👢 Kicked')
        .addFields(
          { name: 'User',   value: `${member.user.tag} (${userId})`, inline: true },
          { name: 'By',     value: interaction.user.username,         inline: true },
          { name: 'Reason', value: reason },
        )
        .setTimestamp(),
    ],
  });
}

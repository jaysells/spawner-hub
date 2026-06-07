// commands/timeout.js
import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { COLORS, isOwner } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('(Owner) Timeout a user');

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('timeout:modal')
    .setTitle('Timeout User');

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
        .setCustomId('duration')
        .setLabel('Duration')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 10m  /  2h  /  1d  /  7d (max)')
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

// Parse "10m", "2h", "1d" → milliseconds
function parseDuration(str) {
  const match = str.trim().match(/^(\d+)\s*([mhd])$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}

export async function handleModal(interaction) {
  const userId   = interaction.fields.getTextInputValue('userId').trim();
  const durStr   = interaction.fields.getTextInputValue('duration').trim();
  const reason   = interaction.fields.getTextInputValue('reason').trim() || 'No reason provided';

  await interaction.deferReply({ ephemeral: true });

  const durationMs = parseDuration(durStr);
  if (!durationMs) {
    return interaction.editReply({ content: '❌ Invalid duration. Use format: `10m`, `2h`, `1d`' });
  }

  // Max Discord timeout is 28 days
  const maxMs = 28 * 24 * 60 * 60 * 1000;
  if (durationMs > maxMs) {
    return interaction.editReply({ content: '❌ Max timeout is 28 days.' });
  }

  let member;
  try {
    member = await interaction.guild.members.fetch(userId);
  } catch {
    return interaction.editReply({ content: '❌ Could not find that user in this server.' });
  }

  const endsAt      = Math.floor((Date.now() + durationMs) / 1000);
  const endsAtFull  = Math.floor((Date.now() + durationMs) / 1000);

  const dmEmbed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🔨 The ban hammer has spoken')
    .addFields(
      { name: 'Punishment',      value: '**Timeout**',                        inline: true },
      { name: 'By',              value: `${interaction.user.username}`,        inline: true },
      { name: 'Time Remaining',  value: `<t:${endsAt}:R>` },
      { name: 'Reason',          value: reason },
    )
    .setTimestamp();

  await member.user.send({ embeds: [dmEmbed] }).catch(() => {});

  try {
    await member.timeout(durationMs, reason);
  } catch {
    return interaction.editReply({ content: '❌ Failed to timeout. Do I have Moderate Members permission?' });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('⏱️ Timed Out')
        .addFields(
          { name: 'User',          value: `${member.user.tag} (${userId})`, inline: true },
          { name: 'By',            value: interaction.user.username,         inline: true },
          { name: 'Expires',       value: `<t:${endsAtFull}:R>` },
          { name: 'Reason',        value: reason },
        )
        .setTimestamp(),
    ],
  });
}

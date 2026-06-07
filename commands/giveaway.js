// commands/giveaway.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { saveGiveaway } from '../utils/redis.js';
import { COLORS, isOwner } from '../utils/constants.js';
import { randomUUID } from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('(Owner) Start a giveaway')
  .addStringOption(opt =>
    opt.setName('prize').setDescription('What are you giving away?').setRequired(true))
  .addIntegerOption(opt =>
    opt.setName('minutes').setDescription('How many minutes does it run?').setRequired(true));

export async function execute(interaction) {
  if (!isOwner(interaction.member)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }

  const prize   = interaction.options.getString('prize');
  const minutes = interaction.options.getInteger('minutes');
  const endsAt  = Date.now() + minutes * 60 * 1000;
  const id      = randomUUID();

  const embed = new EmbedBuilder()
    .setColor(COLORS.accent)
    .setTitle('🎉 GIVEAWAY!')
    .setDescription(
      `**Prize:** ${prize}\n\n` +
      `React with 🎉 below to enter!\n\n` +
      `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`,
    )
    .setFooter({ text: `Giveaway ID: ${id} • Hosted by ${interaction.user.tag}` })
    .setTimestamp(endsAt);

  const msg = await interaction.channel.send({ embeds: [embed] });
  await msg.react('🎉');

  const giveaway = {
    id,
    prize,
    messageId: msg.id,
    channelId: msg.channelId,
    hostId:    interaction.user.id,
    endsAt,
    endedAt:   null,
    entries:   [],
    winner:    null,
    active:    true,
  };

  await saveGiveaway(giveaway);

  // Auto-end timer
  setTimeout(() => endGiveaway(interaction.client, giveaway), minutes * 60 * 1000);

  await interaction.reply({ content: `✅ Giveaway started! [Jump to message](${msg.url})`, ephemeral: true });
}

export async function endGiveaway(client, giveaway) {
  const { getGiveaway, saveGiveaway } = await import('../utils/redis.js');

  // Re-fetch to get latest entries
  const fresh = await getGiveaway(giveaway.id);
  if (!fresh || !fresh.active) return;

  const channel = await client.channels.fetch(fresh.channelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(fresh.messageId).catch(() => null);

  // Collect real reactor user IDs (excluding bot)
  let entries = [];
  if (msg) {
    const reaction = msg.reactions.cache.get('🎉');
    if (reaction) {
      const users = await reaction.users.fetch();
      entries = users.filter(u => !u.bot).map(u => u.id);
    }
  }

  const winner = entries.length > 0
    ? entries[Math.floor(Math.random() * entries.length)]
    : null;

  const updated = {
    ...fresh,
    entries,
    winner,
    endedAt: Date.now(),
    active:  false,
  };
  await saveGiveaway(updated);

  const embed = new EmbedBuilder()
    .setColor(winner ? COLORS.success : COLORS.danger)
    .setTitle('🎉 Giveaway Ended!')
    .setDescription(
      winner
        ? `**Prize:** ${fresh.prize}\n\n🏆 **Winner:** <@${winner}>\n\nCongratulations! Open a **Giveaway Claim** ticket to collect your prize.`
        : `**Prize:** ${fresh.prize}\n\n😔 No valid entries — no winner.`,
    )
    .setFooter({ text: `Giveaway ID: ${fresh.id}` })
    .setTimestamp();

  if (msg) {
    await msg.edit({ embeds: [embed] }).catch(() => {});
  }

  if (winner) {
    await channel.send(`🎉 Congratulations <@${winner}>! You won **${fresh.prize}**! Open a Giveaway Claim ticket to collect.`);
  }
}

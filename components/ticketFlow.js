// components/ticketFlow.js
// Handles all ticket button clicks and dropdown step progression.

import {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType,
} from 'discord.js';
import { getStock, getRecentEndedGiveaways } from '../utils/redis.js';
import { SPAWNERS, COLORS, OWNER_ROLE_ID, TICKET_CATEGORY_ID, fmt } from '../utils/constants.js';

// In-memory session store: Map<userId, sessionData>
const sessions = new Map();

// ── Entry point: user clicks a ticket button ───────────────────
export async function handleTicketButton(interaction, type) {
  // Start a fresh session
  sessions.set(interaction.user.id, { type, step: 0, answers: {} });
  await sendStep(interaction, interaction.user.id);
}

// ── Handle a dropdown selection ────────────────────────────────
export async function handleTicketStep(interaction) {
  const userId  = interaction.user.id;
  const session = sessions.get(userId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired. Please click the ticket button again.', ephemeral: true });
  }

  const value = interaction.values[0];
  advanceSession(session, value);

  const done = isSessionComplete(session);
  if (done) {
    await openTicketChannel(interaction, session);
    sessions.delete(userId);
  } else {
    await sendStep(interaction, userId, true);
  }
}

// ── Send the current step's dropdown ──────────────────────────
async function sendStep(interaction, userId, update = false) {
  const session = sessions.get(userId);
  const { type, step, answers } = session;

  let embed, row;

  if (type === 'trade') {
    ({ embed, row } = await tradeStep(step, answers));
  } else if (type === 'giveaway') {
    ({ embed, row } = await giveawayStep(step, answers));
  } else if (type === 'digging') {
    ({ embed, row } = diggingStep(step, answers));
  } else if (type === 'support') {
    // Support has no questions — open immediately
    await openTicketChannel(interaction, session);
    sessions.delete(userId);
    return;
  }

  const payload = { embeds: [embed], components: [row], ephemeral: true };

  if (update) {
    await interaction.update(payload);
  } else {
    await interaction.reply(payload);
  }
}

// ── Trade steps ────────────────────────────────────────────────
async function tradeStep(step, answers) {
  if (step === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🦴 Trade Ticket — Step 1 of 5')
        .setDescription('Are you **buying** spawners from us, or **selling** spawners to us?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Choose...')
          .addOptions([
            { label: 'Buying — I want to buy spawners',  value: 'buy',  emoji: '🟢' },
            { label: 'Selling — I want to sell spawners', value: 'sell', emoji: '🔴' },
          ]),
      ),
    };
  }

  if (step === 1) {
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🦴 Trade Ticket — Step 2 of 5')
        .setDescription('Which spawner type?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Choose spawner...')
          .addOptions(SPAWNERS.map(s => ({ label: s.label, value: s.id, emoji: s.emoji }))),
      ),
    };
  }

  if (step === 2) {
    const verb = answers.direction === 'buy' ? 'buying' : 'selling';
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🦴 Trade Ticket — Step 3 of 5')
        .setDescription(`How many spawners are you **${verb}**?`),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Quantity...')
          .addOptions(
            [1,2,3,4,5,10,15,20,25,50].map(n => ({ label: `${n} spawner${n>1?'s':''}`, value: String(n) }))
          ),
      ),
    };
  }

  if (step === 3) {
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🦴 Trade Ticket — Step 4 of 5')
        .setDescription('What is your **Minecraft username**?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Your username starts with...')
          .addOptions(
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').slice(0,25).map(c => ({
              label: `My username starts with "${c}"`,
              value: `username_letter_${c}`,
            }))
          ),
      ),
    };
  }

  // Step 4 — NOTE: username is collected via a separate modal after ticket opens
  // (Discord limits dropdowns to 25 options; usernames are too variable)
  // Step 4: terms
  return {
    embed: new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🦴 Trade Ticket — Step 5 of 5')
      .setDescription(
        '**Terms of Trading:**\n\n' +
        '• You must be on **DonutSMP** to trade.\n' +
        '• Prices are final at time of trade.\n' +
        '• No refunds after trade is complete.\n' +
        '• Do not waste staff time — only open if you are ready to trade.\n\n' +
        '**Do you accept these terms?**'
      ),
    row: new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticketstep')
        .setPlaceholder('Choose...')
        .addOptions([
          { label: 'Yes — I understand and accept the terms', value: 'yes', emoji: '✅' },
          { label: 'No',                                       value: 'no',  emoji: '❌' },
        ]),
    ),
  };
}

// ── Giveaway claim steps ───────────────────────────────────────
async function giveawayStep(step, answers) {
  if (step === 0) {
    const ended = await getRecentEndedGiveaways(10);
    const options = ended.length > 0
      ? ended.map(g => ({ label: g.prize.slice(0, 100), value: g.id }))
      : [{ label: 'No recent giveaways', value: 'none' }];

    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle('🎉 Giveaway Claim — Step 1 of 2')
        .setDescription('Which giveaway did you win?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Select giveaway...')
          .addOptions(options),
      ),
    };
  }

  return {
    embed: new EmbedBuilder()
      .setColor(COLORS.accent)
      .setTitle('🎉 Giveaway Claim — Step 2 of 2')
      .setDescription('What is your **Minecraft username**? (First letter)'),
    row: new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticketstep')
        .setPlaceholder('Username starts with...')
        .addOptions(
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').slice(0,25).map(c => ({
            label: `My username starts with "${c}"`,
            value: `username_letter_${c}`,
          }))
        ),
    ),
  };
}

// ── Digging service steps ──────────────────────────────────────
function diggingStep(step, answers) {
  if (step === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('⛏️ Digging Service — Step 1 of 2')
        .setDescription('How big is the area you need dug?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Size...')
          .addOptions([
            { label: 'Small  (up to 16x16)',    value: 'small' },
            { label: 'Medium (16x16 to 32x32)', value: 'medium' },
            { label: 'Large  (32x32 to 64x64)', value: 'large' },
            { label: 'Huge   (64x64+)',         value: 'huge' },
            { label: 'Custom (explain in ticket)', value: 'custom' },
          ]),
      ),
    };
  }

  return {
    embed: new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('⛏️ Digging Service — Step 2 of 2')
      .setDescription('What is your **Minecraft username**? (First letter)'),
    row: new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticketstep')
        .setPlaceholder('Username starts with...')
        .addOptions(
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').slice(0,25).map(c => ({
            label: `My username starts with "${c}"`,
            value: `username_letter_${c}`,
          }))
        ),
    ),
  };
}

// ── Advance session based on answer ───────────────────────────
function advanceSession(session, value) {
  const { type, step, answers } = session;

  if (type === 'trade') {
    if (step === 0) answers.direction = value;
    if (step === 1) answers.spawnerId = value;
    if (step === 2) answers.quantity  = parseInt(value);
    if (step === 3) answers.usernameLetter = value.replace('username_letter_', '');
    if (step === 4) answers.terms = value;
  } else if (type === 'giveaway') {
    if (step === 0) answers.giveawayId     = value;
    if (step === 1) answers.usernameLetter = value.replace('username_letter_', '');
  } else if (type === 'digging') {
    if (step === 0) answers.size          = value;
    if (step === 1) answers.usernameLetter = value.replace('username_letter_', '');
  }

  session.step++;
}

function isSessionComplete(session) {
  const { type, step, answers } = session;
  if (type === 'trade')    return step >= 5;
  if (type === 'giveaway') return step >= 2;
  if (type === 'digging')  return step >= 2;
  if (type === 'support')  return true;
  return false;
}

// ── Open the actual ticket channel ────────────────────────────
async function openTicketChannel(interaction, session) {
  const { type, answers } = session;
  const guild  = interaction.guild;
  const user   = interaction.user;

  // Refuse if terms declined for trade
  if (type === 'trade' && answers.terms === 'no') {
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle('❌ Terms Not Accepted')
          .setDescription('You must accept the terms of trading to open a ticket. Please try again.'),
      ],
      components: [],
    });
  }

  // Create private channel
  const channelName = `${type}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

  const permissionOverwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id,              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: OWNER_ROLE_ID,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
  ];

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID || null,
    permissionOverwrites,
    topic: `${type.toUpperCase()} ticket for ${user.tag}`,
  });

  // Build the summary embed
  const summaryEmbed = await buildSummaryEmbed(type, answers, user, guild);

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: `<@${user.id}> <@&${OWNER_ROLE_ID}>`,
    embeds:  [summaryEmbed],
    components: [closeRow],
  });

  if (type === 'trade') {
    // Also send a username prompt since we only got first letter
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.info)
          .setDescription('📝 **Please type your full Minecraft username below so staff can assist you.**'),
      ],
    });
  }

  const replyEmbed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('✅ Ticket Opened!')
    .setDescription(`Your ticket is ready: ${channel}\n\nHead over there to continue!`);

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [replyEmbed], components: [] });
  } else {
    await interaction.update({ embeds: [replyEmbed], components: [] });
  }
}

// ── Build summary embed for the ticket channel ────────────────
async function buildSummaryEmbed(type, answers, user, guild) {
  if (type === 'trade') {
    const stock   = await getStock();
    const spawner = SPAWNERS.find(s => s.id === answers.spawnerId);
    const data    = stock[answers.spawnerId] || {};
    const qty     = answers.quantity;
    const dir     = answers.direction;

    const price   = dir === 'buy' ? data.sellPrice : data.buyPrice;
    const total   = price ? price * qty : null;

    return new EmbedBuilder()
      .setColor(dir === 'buy' ? COLORS.success : COLORS.danger)
      .setTitle(`${dir === 'buy' ? '🟢 Buy' : '🔴 Sell'} Ticket — ${spawner?.label ?? answers.spawnerId}`)
      .setDescription(`<@${user.id}> wants to **${dir === 'buy' ? 'buy from us' : 'sell to us'}**.`)
      .addFields(
        { name: 'Spawner',   value: `${spawner?.emoji ?? ''} ${spawner?.label ?? answers.spawnerId}`, inline: true },
        { name: 'Quantity',  value: `${qty}`,  inline: true },
        { name: dir === 'buy' ? 'Our Sell Price' : 'Our Buy Price',
          value: price ? `$${fmt(price)} ea` : '⚠️ Not set', inline: true },
        { name: 'Total',     value: total ? `$${fmt(total)}` : '⚠️ Price not set', inline: true },
        { name: 'Username Starts With', value: answers.usernameLetter ?? '?', inline: true },
        { name: 'Terms',     value: '✅ Accepted', inline: true },
      )
      .setFooter({ text: `Opened by ${user.tag} • ${new Date().toLocaleString()}` });
  }

  if (type === 'giveaway') {
    return new EmbedBuilder()
      .setColor(COLORS.accent)
      .setTitle('🎉 Giveaway Claim Ticket')
      .setDescription(`<@${user.id}> is claiming a giveaway prize.`)
      .addFields(
        { name: 'Giveaway ID',            value: answers.giveawayId ?? 'Unknown', inline: true },
        { name: 'Username Starts With',   value: answers.usernameLetter ?? '?',   inline: true },
      )
      .addFields({ name: '\u200B', value: '📝 **Please type your full Minecraft username below.**' })
      .setFooter({ text: `Opened by ${user.tag}` });
  }

  if (type === 'digging') {
    return new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('⛏️ Digging Service Ticket')
      .setDescription(`<@${user.id}> needs digging done.`)
      .addFields(
        { name: 'Area Size',              value: answers.size ?? 'Unknown',      inline: true },
        { name: 'Username Starts With',   value: answers.usernameLetter ?? '?',  inline: true },
      )
      .addFields({ name: '\u200B', value: '📝 **Please type your full Minecraft username and describe exactly what needs to be dug.**' })
      .setFooter({ text: `Opened by ${user.tag}` });
  }

  if (type === 'support') {
    return new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('🆘 Support Ticket')
      .setDescription(`<@${user.id}> needs support.\n\n📝 **Please describe your issue below.**`)
      .setFooter({ text: `Opened by ${user.tag}` });
  }
}

export async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.danger)
        .setDescription('🔒 This ticket will be deleted in **5 seconds**.'),
    ],
  });
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

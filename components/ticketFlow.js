// components/ticketFlow.js
import {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getStock, getRecentEndedGiveaways } from '../utils/redis.js';
import { SPAWNERS, COLORS, OWNER_ROLE_ID, TICKET_CATEGORY_ID, fmt } from '../utils/constants.js';

const sessions = new Map();

// ── Entry point ────────────────────────────────────────────────
export async function handleTicketButton(interaction, type) {
  sessions.set(interaction.user.id, { type, step: 0, answers: {} });
  await sendStep(interaction, interaction.user.id);
}

// ── Dropdown selections ────────────────────────────────────────
export async function handleTicketStep(interaction) {
  const userId  = interaction.user.id;
  const session = sessions.get(userId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired. Click the ticket button again.', ephemeral: true });
  }

  const value = interaction.values[0];
  const { type, step, answers } = session;

  if (type === 'trade') {
    if (step === 0) answers.direction = value;  // buy/sell
    if (step === 1) answers.spawnerId = value;  // spawner type
    if (step === 2) answers.terms     = value;  // yes/no
  } else if (type === 'giveaway') {
    if (step === 0) answers.giveawayId = value;
  } else if (type === 'digging') {
    if (step === 0) answers.size = value;
  }

  session.step++;

  // Trade: after terms accepted show modal for qty + username
  if (type === 'trade' && session.step === 3) {
    if (answers.terms === 'no') {
      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle('❌ Terms Not Accepted')
            .setDescription('You must accept the terms to open a ticket. Please try again.'),
        ],
        components: [],
      });
    }
    // Show modal for qty + username
    return showTradeModal(interaction, answers.direction);
  }

  // Giveaway: after picking giveaway show modal for username
  if (type === 'giveaway' && session.step === 1) {
    return showGiveawayModal(interaction);
  }

  // Digging: after picking size show modal for username
  if (type === 'digging' && session.step === 1) {
    return showDiggingModal(interaction);
  }

  // Support: open immediately
  if (type === 'support') {
    await openTicketChannel(interaction, session);
    sessions.delete(userId);
    return;
  }

  await sendStep(interaction, userId, true);
}

// ── Modal shows ────────────────────────────────────────────────
async function showTradeModal(interaction, direction) {
  const verb = direction === 'buy' ? 'buying' : 'selling';
  const modal = new ModalBuilder()
    .setCustomId('ticket:tradeModal')
    .setTitle('Almost done!');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Your Minecraft Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Steve123')
        .setRequired(true),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quantity')
        .setLabel(`How many spawners are you ${verb}?`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 5')
        .setRequired(true),
    ),
  );

  await interaction.showModal(modal);
}

async function showGiveawayModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket:giveawayModal')
    .setTitle('Giveaway Claim');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Your Minecraft Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Steve123')
        .setRequired(true),
    ),
  );

  await interaction.showModal(modal);
}

async function showDiggingModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket:diggingModal')
    .setTitle('Digging Service');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Your Minecraft Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Steve123')
        .setRequired(true),
    ),
  );

  await interaction.showModal(modal);
}

// ── Modal submissions ──────────────────────────────────────────
export async function handleTicketModal(interaction) {
  const userId  = interaction.user.id;
  const session = sessions.get(userId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired. Click the ticket button again.', ephemeral: true });
  }

  const customId = interaction.customId;

  if (customId === 'ticket:tradeModal') {
    const username = interaction.fields.getTextInputValue('username').trim();
    const qty      = parseInt(interaction.fields.getTextInputValue('quantity').trim());
    if (isNaN(qty) || qty < 1) {
      return interaction.reply({ content: '❌ Quantity must be a valid number.', ephemeral: true });
    }
    session.answers.username = username;
    session.answers.quantity = qty;
  } else if (customId === 'ticket:giveawayModal' || customId === 'ticket:diggingModal') {
    session.answers.username = interaction.fields.getTextInputValue('username').trim();
  }

  await openTicketChannel(interaction, session);
  sessions.delete(userId);
}

// ── Send dropdown step ─────────────────────────────────────────
async function sendStep(interaction, userId, update = false) {
  const session = sessions.get(userId);
  const { type, step, answers } = session;

  let embed, row;

  if (type === 'trade')    ({ embed, row } = await tradeStep(step, answers));
  else if (type === 'giveaway') ({ embed, row } = await giveawayStep(step, answers));
  else if (type === 'digging')  ({ embed, row } = diggingStep(step, answers));
  else if (type === 'support') {
    await openTicketChannel(interaction, session);
    sessions.delete(userId);
    return;
  }

  const payload = { embeds: [embed], components: [row], ephemeral: true };
  if (update) await interaction.update(payload);
  else        await interaction.reply(payload);
}

// ── Trade dropdown steps (direction → spawner → terms) ────────
async function tradeStep(step, answers) {
  if (step === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🦴 Trade Ticket — Step 1 of 3')
        .setDescription('Are you **buying** spawners from us, or **selling** spawners to us?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Choose...')
          .addOptions([
            { label: 'Buying — I want to buy spawners',   value: 'buy',  emoji: '🟢' },
            { label: 'Selling — I want to sell spawners', value: 'sell', emoji: '🔴' },
          ]),
      ),
    };
  }

  if (step === 1) {
    return {
      embed: new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🦴 Trade Ticket — Step 2 of 3')
        .setDescription('Which spawner type?'),
      row: new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketstep')
          .setPlaceholder('Choose spawner...')
          .addOptions(SPAWNERS.map(s => ({ label: s.label, value: s.id, emoji: s.emoji }))),
      ),
    };
  }

  // Step 2: terms
  return {
    embed: new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🦴 Trade Ticket — Step 3 of 3')
      .setDescription('Do you accept the terms of trading?'),
    row: new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticketstep')
        .setPlaceholder('Choose...')
        .addOptions([
          { label: 'Yes — I accept the terms', value: 'yes', emoji: '✅' },
          { label: 'No',                        value: 'no',  emoji: '❌' },
        ]),
    ),
  };
}

// ── Giveaway claim step ────────────────────────────────────────
async function giveawayStep(step, answers) {
  const ended  = await getRecentEndedGiveaways(10);
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

// ── Digging service step ───────────────────────────────────────
function diggingStep(step, answers) {
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
          { label: 'Small  (up to 16x16)',       value: 'small' },
          { label: 'Medium (16x16 to 32x32)',    value: 'medium' },
          { label: 'Large  (32x32 to 64x64)',    value: 'large' },
          { label: 'Huge   (64x64+)',             value: 'huge' },
          { label: 'Custom (explain in ticket)', value: 'custom' },
        ]),
    ),
  };
}

// ── Open ticket channel ────────────────────────────────────────
async function openTicketChannel(interaction, session) {
  const { type, answers } = session;
  const guild = interaction.guild;
  const user  = interaction.user;

  const channelName = `${type}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

  const permissionOverwrites = [
    { id: guild.roles.everyone, deny:  [PermissionFlagsBits.ViewChannel] },
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

  const summaryEmbed = await buildSummaryEmbed(type, answers, user);

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

  if (type === 'digging' || type === 'support') {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.info)
          .setDescription(
            type === 'digging'
              ? '📝 **Please describe exactly what needs to be dug and your coordinates.**'
              : '📝 **Please describe your issue below.**'
          ),
      ],
    });
  }

  const replyEmbed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('✅ Ticket Opened!')
    .setDescription(`Your ticket is ready: ${channel}`);

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [replyEmbed], components: [] });
    } else {
      await interaction.reply({ embeds: [replyEmbed], components: [], ephemeral: true });
    }
  } catch {
    // Modal submissions need reply not update
    await interaction.reply({ embeds: [replyEmbed], components: [], ephemeral: true }).catch(() => {});
  }
}

// ── Summary embed ──────────────────────────────────────────────
async function buildSummaryEmbed(type, answers, user) {
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
        { name: 'Quantity',  value: `${qty}`, inline: true },
        { name: dir === 'buy' ? 'Our Sell Price' : 'Our Buy Price',
          value: price ? `$${fmt(price)} ea` : '⚠️ Not set', inline: true },
        { name: 'Total',     value: total ? `$${fmt(total)}` : '⚠️ Price not set', inline: true },
        { name: 'Username',  value: answers.username, inline: true },
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
        { name: 'Giveaway ID',  value: answers.giveawayId ?? 'Unknown', inline: true },
        { name: 'Username',     value: answers.username ?? '?',          inline: true },
      )
      .setFooter({ text: `Opened by ${user.tag}` });
  }

  if (type === 'digging') {
    return new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('⛏️ Digging Service Ticket')
      .setDescription(`<@${user.id}> needs digging done.`)
      .addFields(
        { name: 'Area Size', value: answers.size ?? 'Unknown',  inline: true },
        { name: 'Username',  value: answers.username ?? '?',    inline: true },
      )
      .setFooter({ text: `Opened by ${user.tag}` });
  }

  if (type === 'support') {
    return new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('🆘 Support Ticket')
      .setDescription(`<@${user.id}> needs support.`)
      .setFooter({ text: `Opened by ${user.tag}` });
  }
}

export async function handleTicketClose(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket:closeModal')
    .setTitle('Close Ticket');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Trade completed')
        .setRequired(false),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleTicketCloseModal(interaction) {
  const channel = interaction.channel;
  const reason  = interaction.fields.getTextInputValue('reason').trim() || 'No reason provided';
  const closer  = interaction.user;

  // Find the ticket opener from channel topic or first mention
  const topic     = channel.topic || '';
  const ticketName = channel.name;

  // DM the ticket opener — find their ID from channel permissions
  const overwrite = channel.permissionOverwrites.cache.find(
    o => o.type === 1 && o.id !== closer.id
  );

  if (overwrite) {
    const openerId = overwrite.id;
    const opener   = await interaction.client.users.fetch(openerId).catch(() => null);
    if (opener) {
      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('🔒 Your Ticket Has Been Closed')
        .addFields(
          { name: 'Ticket',    value: ticketName,     inline: true },
          { name: 'Closed by', value: closer.username, inline: true },
          { name: 'Reason',    value: reason },
        )
        .setTimestamp();

      await opener.send({ embeds: [dmEmbed] }).catch(() => {});
    }
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.danger)
        .setDescription(),
    ],
  });

  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

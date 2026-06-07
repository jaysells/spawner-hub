// events/interactionCreate.js
import { handleTicketButton, handleTicketStep, handleTicketClose, handleTicketModal, handleTicketCloseModal } from '../components/ticketFlow.js';
import { handleSelect as updateStockSelect, handleModal as updateStockModal } from '../commands/updatestock.js';
import { handleRerollSelect } from '../commands/reroll.js';
import { handleModal as banModal } from '../commands/ban.js';
import { handleModal as kickModal } from '../commands/kick.js';
import { handleModal as timeoutModal } from '../commands/timeout.js';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [ns, action] = interaction.customId.split(':');
      if (ns === 'ticket') {
        if (action === 'close') return handleTicketClose(interaction);
        return handleTicketButton(interaction, action);
      }
    }

    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id === 'ticketstep')         return handleTicketStep(interaction);
      if (id === 'updatestock:select') return updateStockSelect(interaction);
      if (id === 'reroll:select')      return handleRerollSelect(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('updatestock:modal:')) {
        return updateStockModal(interaction, interaction.customId.split(':')[2]);
      }
      if (interaction.customId === 'ban:modal')          return banModal(interaction);
      if (interaction.customId === 'kick:modal')         return kickModal(interaction);
      if (interaction.customId === 'timeout:modal')      return timeoutModal(interaction);
      if (interaction.customId === 'ticket:closeModal') return handleTicketCloseModal(interaction);
      if (interaction.customId.startsWith('ticket:') && interaction.customId.endsWith('Modal')) {
        return handleTicketModal(interaction);
      }
    }

  } catch (err) {
    console.error('interactionCreate error:', err);
    const reply = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

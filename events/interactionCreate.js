// events/interactionCreate.js
import { handleTicketButton, handleTicketStep, handleTicketClose } from '../components/ticketFlow.js';
import { handleSelect as updateStockSelect, handleModal as updateStockModal } from '../commands/updatestock.js';
import { handleRerollSelect } from '../commands/reroll.js';

export const name    = 'interactionCreate';
export const once    = false;

export async function execute(interaction, client) {
  try {
    // ── Slash commands ─────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
      return;
    }

    // ── Buttons ────────────────────────────────────────
    if (interaction.isButton()) {
      const [ns, action] = interaction.customId.split(':');

      if (ns === 'ticket') {
        if (action === 'close') return handleTicketClose(interaction);
        return handleTicketButton(interaction, action);
      }
    }

    // ── Select menus ───────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id === 'ticketstep')       return handleTicketStep(interaction);
      if (id === 'updatestock:select') return updateStockSelect(interaction);
      if (id === 'reroll:select')    return handleRerollSelect(interaction);
    }

    // ── Modals ─────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('updatestock:modal:')) {
        const spawnerId = interaction.customId.split(':')[2];
        return updateStockModal(interaction, spawnerId);
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

// js/alchemy/alchemyInterfaceCauldron.js
import { highlightOutcome } from './alchemyInterfaceCompendium.js';
import { performCrafting } from './alchemyCrafting.js';
import { ReagentSelectionDialog } from './reagentSelectionDialog.js';

window.addEventListener('error', (event) => {
  console.error('Global unhandled error:', event.message, event.error);
});

Hooks.on('error', (error) => {
  console.error('Foundry error:', error.message, error.stack);
});

export function handleCauldronListeners(alchemyInterface, html) {
  const actor = alchemyInterface._actor;

  if (!actor) {
    ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
    return;
  }

  html.find('.reagent-drop-zone').on('dragover', (event) => {
    event.preventDefault();
  });

  html.find('.reagent-drop-zone').on('drop', async (event) => {
    event.preventDefault();
    try {
      const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
      if (data.type !== 'Item') {
        ui.notifications.warn("Only items can be dropped here.");
        return;
      }
      let item = await fromUuid(data.uuid);
      if (!item) {
        item = game.items.get(data.id) || actor.items.get(data.id);
        if (!item) {
          ui.notifications.error("Failed to resolve dropped item.");
          return;
        }
      }

      const isReagent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') === true;
      if (!isReagent) {
        ui.notifications.warn("Only reagents can be dropped into the cauldron.");
        return;
      }

      const slotIndex = $(event.currentTarget).closest('.reagent-slot').data('slot');
      const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
      for (let i = 0; i < 3; i++) {
        if (i.toString() !== slotIndex.toString() && cauldronSlots[i.toString()] === item.id) {
          ui.notifications.warn("Cannot use the same reagent more than once in the cauldron.");
          return;
        }
      }

      let slots = foundry.utils.deepClone(cauldronSlots);
      slots[slotIndex] = item.id;
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', slots);
      alchemyInterface.render();
    } catch (error) {
      ui.notifications.error("Failed to drop item: " + error.message);
    }
  });

  html.find('.reagent-drop-zone').on('click', async (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      return;
    }

    const $dropZone = $(event.currentTarget);
    const slotIndex = $dropZone.closest('.reagent-slot').data('slot');
    const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
    const itemId = cauldronSlots[slotIndex];

    if (itemId) {
      const item = game.items.get(itemId) || actor.items.get(itemId);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.error("Item not found.");
      }
    } else {
      const dialog = new ReagentSelectionDialog(actor, slotIndex, cauldronSlots, alchemyInterface);
      dialog.render(true);
    }
  });

  html.find('.craft-btn').on('click', async (event) => {
    event.preventDefault();
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      return;
    }

    try {
      const cauldronData = await prepareCauldronData(actor);
      const { outcomeIcons, ipSums } = cauldronData;

      if (!outcomeIcons || outcomeIcons.length === 0) {
        ui.notifications.warn("No outcome to craft. Please fill all reagent slots.");
        return;
      }

      const selectedOutcome = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      let craftedOutcome;
      if (selectedOutcome) {
        craftedOutcome = outcomeIcons.find(outcome =>
          outcome.category === selectedOutcome.category && outcome.sum === selectedOutcome.sum
        );
      }
      if (!craftedOutcome) {
        craftedOutcome = outcomeIcons[0];
      }

      if (!craftedOutcome) {
        ui.notifications.error("Failed to determine the outcome to craft.");
        return;
      }

      const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
      const craftingResult = await performCrafting(actor, cauldronSlots, ipSums, selectedOutcome);

      if (craftingResult.success) {
        const memory = foundry.utils.deepClone(
          actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || { Combat: [], Utility: [], Entropy: [] }
        );
        const capitalizedCategory = craftingResult.category.charAt(0).toUpperCase() + craftingResult.category.slice(1);
        if (!memory[capitalizedCategory].includes(craftingResult.sum)) {
          memory[capitalizedCategory].push(craftingResult.sum);
          await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', memory);
        }

        await ChatMessage.create({
          content: craftingResult.message,
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          type: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
      } else {
        ui.notifications.warn(craftingResult.message);
      }

      alchemyInterface.render();
    } catch (error) {
      ui.notifications.error("Failed to craft: " + error.message);
    }
  });

  html.find('.clear-btn').on('click', async (event) => {
    event.preventDefault();
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      return;
    }

    try {
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', { 0: null, 1: null, 2: null });
      await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      alchemyInterface.render();
    } catch (error) {
      ui.notifications.error("Failed to clear cauldron slots: " + error.message);
    }
  });

  html.find('.outcome-icon').on('click', async (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      return;
    }

    const $icon = $(event.currentTarget);
    const category = $icon.data('category');
    const sum = $icon.data('sum');
    await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome', { category, sum });
    alchemyInterface.render();
  });

  html.find('.details-btn').on('click', (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      return;
    }

    const $button = $(event.currentTarget);
    const itemId = $button.data('item-id');
    if (itemId) {
      const item = game.items.get(itemId) || actor.items.get(itemId) || (itemId ? fromUuidSync(itemId) : null);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.error("Item not found.");
      }
    }
  });
}

export async function prepareCauldronData(actor) {
  if (!actor) {
    console.error("prepareCauldronData: actor is undefined");
    return {
      cauldronSlots: [null, null, null],
      reagentNames: ["Drop Reagent", "Drop Reagent", "Drop Reagent"],
      ipSums: { combat: 0, utility: 0, entropy: 0 },
      highlight: { combat: false, utility: false, entropy: false },
      outcomeIcons: [],
      allSlotsFilled: false
    };
  }

  const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
  const resolvedSlots = [];
  const reagentNames = [];
  let ipSums = { combat: 0, utility: 0, entropy: 0 };
  let allSlotsFilled = true;

  console.debug("Cauldron Slots:", cauldronSlots);

  for (let i = 0; i < 3; i++) {
    const slotKey = i.toString();
    const itemId = cauldronSlots[slotKey];
    if (itemId) {
      const item = await fromUuid(itemId) || game.items.get(itemId) || actor.items.get(itemId);
      resolvedSlots[i] = item ? item.img : null;
      reagentNames[i] = item ? item.name || "Unknown Reagent" : null;
      if (item) {
        const flags = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
        ipSums.combat += flags.combat || 0;
        ipSums.utility += flags.utility || 0;
        ipSums.entropy += flags.entropy || 0;
      }
    } else {
      resolvedSlots[i] = null;
      reagentNames[i] = "Drop Reagent";
      allSlotsFilled = false;
    }
    console.debug(`Slot ${i}: Item ID = ${itemId}, Filled = ${!!itemId}`);
  }

  const highlight = { combat: false, utility: false, entropy: false };
  let outcomeIcons = [];

  if (allSlotsFilled) {
    const sums = [
      { category: 'combat', value: ipSums.combat },
      { category: 'utility', value: ipSums.utility },
      { category: 'entropy', value: ipSums.entropy }
    ];
    const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
    const highestCategories = sums.filter(sum => sum.value === maxSum);

    highestCategories.forEach(({ category }) => {
      highlight[category] = true;
    });

    const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
    const selectedOutcome = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome') || null;

    outcomeIcons = await Promise.all(highestCategories.map(async ({ category, value: sum }) => {
      const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
      const itemUuid = outcomes[capitalizedCategory][sum] || null;
      let itemImg = 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png';
      let outcomeName = `Unknown ${capitalizedCategory} ${sum}`;
      let hasItem = false;
      let itemId = null;

      if (itemUuid) {
        const item = await fromUuid(itemUuid);
        if (item) {
          itemId = item.id;
          itemImg = item.img;
          outcomeName = item.name || outcomeName;
          hasItem = true;
        }
      }

      const isSelected = selectedOutcome && selectedOutcome.category === category && selectedOutcome.sum === sum;
      return { category, sum, img: itemImg, outcomeName, itemId, hasItem, isSelected };
    }));
  }

  console.debug("prepareCauldronData Result:", {
    allSlotsFilled,
    outcomeIconsLength: outcomeIcons.length,
    cauldronSlots,
    ipSums
  });

  return {
    cauldronSlots: resolvedSlots,
    reagentNames: reagentNames,
    ipSums: ipSums,
    highlight: highlight,
    outcomeIcons: outcomeIcons,
    allSlotsFilled: allSlotsFilled
  };
}
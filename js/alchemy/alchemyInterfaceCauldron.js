import { highlightOutcome } from './alchemyInterfaceCompendium.js';
import { performCrafting } from './alchemyCrafting.js';
import { isReagent } from '../shared/utils.js';

export function handleCauldronListeners(alchemyInterface, html) {
  const actor = alchemyInterface._actor;

  // Validate actor existence
  if (!actor) {
    ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
    console.error("handleCauldronListeners: actor is undefined in alchemyInterface._actor");
    return;
  }

  // Drag-and-drop functionality for reagent slots
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

      // Validation 1: Check if the item is a reagent
      if (!isReagent(item)) {
        ui.notifications.warn("Only reagents can be dropped into the cauldron.");
        return;
      }

      // Get the slot index
      const slotIndex = $(event.currentTarget).closest('.reagent-slot').data('slot');

      // Validation 2: Check if the reagent is already used in another slot
      const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
      for (let i = 0; i < 3; i++) {
        if (i.toString() !== slotIndex.toString() && cauldronSlots[i.toString()] === item.id) {
          ui.notifications.warn("Cannot use the same reagent more than once in the cauldron.");
          return;
        }
      }

      // Initialize cauldronSlots if it doesn't exist
      let slots = foundry.utils.deepClone(cauldronSlots);
      slots[slotIndex] = item.id;

      // Store the slot data on the actor
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', slots);
      alchemyInterface.render();

      // Check if this is the third slot being filled (no tab switching)
      const filledSlots = Object.values(slots).filter(id => id !== null).length;
      if (filledSlots === 3) {
        const cauldronData = await prepareCauldronData(actor);
        const { ipSums } = cauldronData;
        const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
        highlightOutcome('combat', maxSum, html); // Placeholder call, to be adjusted if needed
      }
    } catch (error) {
      ui.notifications.error("Failed to drop item: " + error.message);
    }
  });

  // Craft button functionality
  html.find('.craft-btn').on('click', async (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      console.error("craft-btn: actor is undefined in alchemyInterface._actor");
      return;
    }

    const cauldronData = await prepareCauldronData(actor);
    const { outcomeIcons, ipSums } = cauldronData;

    if (!outcomeIcons || outcomeIcons.length === 0) {
      ui.notifications.warn("No outcome to craft. Please fill all reagent slots.");
      return;
    }

    // Determine the outcome to craft (use selected outcome in tiebreaker, or first outcome if no tiebreaker)
    const selectedOutcome = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
    let craftedOutcome;
    if (selectedOutcome) {
      craftedOutcome = outcomeIcons.find(outcome =>
        outcome.category === selectedOutcome.category && outcome.sum === selectedOutcome.sum
      );
    }
    if (!craftedOutcome) {
      craftedOutcome = outcomeIcons[0]; // Default to the first outcome if no selection
    }

    if (!craftedOutcome) {
      ui.notifications.error("Failed to determine the outcome to craft.");
      return;
    }

    // Perform crafting
    const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
    const craftingResult = await performCrafting(actor, cauldronSlots, ipSums, selectedOutcome);

    if (craftingResult.success) {
      // Update crafting memory with the actual crafted category and sum
      const groupId = await actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId');
      if (!groupId) {
        ui.notifications.warn("This character is not assigned to a campaign. Crafting memory will not be saved.");
      } else {
        const memoryFlag = `craftingMemory.${groupId}`;
        const memory = foundry.utils.deepClone(
          actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag) || { Combat: [], Utility: [], Entropy: [] }
        );
        const capitalizedCategory = craftingResult.category.charAt(0).toUpperCase() + craftingResult.category.slice(1);
        if (!memory[capitalizedCategory].includes(craftingResult.sum)) {
          memory[capitalizedCategory].push(craftingResult.sum);
          await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag, memory);
        }
      }

      // Send chat card
      await ChatMessage.create({
        content: craftingResult.message,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        type: CONST.CHAT_MESSAGE_STYLES.OTHER
      });
    } else {
      ui.notifications.warn(craftingResult.message);
    }

    // No cauldron reset, just re-render to update inventory
    alchemyInterface.render();
  });

  // Clear button functionality
  html.find('.clear-btn').on('click', async (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      console.error("clear-btn: actor is undefined in alchemyInterface._actor");
      return;
    }

    await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', { 0: null, 1: null, 2: null });
    await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
    alchemyInterface.render();
  });

  // Click to open item sheet when slotted
  html.find('.reagent-drop-zone').on('click', (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      console.error("reagent-drop-zone click: actor is undefined in alchemyInterface._actor");
      return;
    }

    const $dropZone = $(event.currentTarget);
    const slotIndex = $dropZone.closest('.reagent-slot').data('slot');
    const slots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
    const itemId = slots[slotIndex];

    if (itemId) {
      const item = game.items.get(itemId) || actor.items.get(itemId);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.error("Item not found.");
      }
    }
  });

  // Click to select an outcome in a tiebreaker scenario
  html.find('.outcome-icon').on('click', async (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      console.error("outcome-icon click: actor is undefined in alchemyInterface._actor");
      return;
    }

    const $icon = $(event.currentTarget);
    const category = $icon.data('category');
    const sum = $icon.data('sum');
    await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome', { category, sum });
    alchemyInterface.render();
  });

  // Click to open item sheet for outcome details
  html.find('.details-btn').on('click', (event) => {
    if (!actor) {
      ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
      console.error("details-btn click: actor is undefined in alchemyInterface._actor");
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
      outcomeIcons: []
    };
  }

  const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
  const resolvedSlots = [];
  const reagentNames = [];
  let ipSums = { combat: 0, utility: 0, entropy: 0 };
  let allSlotsFilled = true;

  for (let i = 0; i < 3; i++) {
    const itemId = cauldronSlots[i.toString()];
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
  }

  // Determine the highest IP sum for highlighting (only if all slots are filled)
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

    // Highlight all tied categories
    highestCategories.forEach(({ category }) => {
      highlight[category] = true;
    });

    // Prepare outcome icons for each highest category
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

  return {
    cauldronSlots: resolvedSlots,
    reagentNames: reagentNames,
    ipSums: ipSums,
    highlight: highlight,
    outcomeIcons: outcomeIcons
  };
}
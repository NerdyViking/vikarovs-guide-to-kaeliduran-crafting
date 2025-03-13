// js/alchemy/alchemyInterfaceCauldron.js
import { highlightOutcome } from './alchemyInterfaceCompendium.js';
import { performCrafting } from './alchemyCrafting.js';
import { ReagentSelectionDialog } from './reagentSelectionDialog.js';

// Safer event handlers with proper jQuery delegation
export function handleCauldronListeners(alchemyInterface, html) {
  if (!alchemyInterface || !alchemyInterface._actor) {
    console.error("No actor context for cauldron listeners");
    return;
  }
  
  const actor = alchemyInterface._actor;

  // Use jQuery's .on() method with proper delegation
  html.on('dragover', '.reagent-drop-zone', event => {
    event.preventDefault();
  });

  html.on('drop', '.reagent-drop-zone', async event => {
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

      const $target = $(event.currentTarget);
      const slotIndex = $target.closest('.reagent-slot').data('slot');
      const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
      
      // Check if this reagent is already in another slot
      for (let i = 0; i < 3; i++) {
        if (i.toString() !== slotIndex.toString() && cauldronSlots[i.toString()] === item.id) {
          ui.notifications.warn("Cannot use the same reagent more than once in the cauldron.");
          return;
        }
      }

      // Update the slot with the new item
      const slots = foundry.utils.deepClone(cauldronSlots);
      slots[slotIndex] = item.id;
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', slots);
      
      // Re-render the interface
      alchemyInterface.render(false);
      
    } catch (error) {
      console.error("Drop error:", error);
      ui.notifications.error("Failed to drop item");
    }
  });

  // Use delegated events for click handlers
  html.on('click', '.reagent-drop-zone', event => {
    const $target = $(event.currentTarget);
    const slotIndex = $target.closest('.reagent-slot').data('slot');
    if (slotIndex === undefined) return;
    
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

  html.on('click', '.craft-btn', async event => {
    event.preventDefault();
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

      alchemyInterface.render(false);
    } catch (error) {
      console.error("Craft error:", error);
      ui.notifications.error("Failed to craft item");
    }
  });

  html.on('click', '.clear-btn', async event => {
    event.preventDefault();
    try {
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', { 0: null, 1: null, 2: null });
      await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      alchemyInterface.render(false);
    } catch (error) {
      console.error("Clear error:", error);
      ui.notifications.error("Failed to clear cauldron");
    }
  });

  html.on('click', '.outcome-icon', async event => {
    const $target = $(event.currentTarget);
    const category = $target.data('category');
    const sum = $target.data('sum');
    
    if (category && sum) {
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome', { category, sum });
      alchemyInterface.render(false);
    }
  });

  html.on('click', '.details-btn', event => {
    const $target = $(event.currentTarget);
    const itemId = $target.data('item-id');
    
    if (itemId) {
      try {
        const item = game.items.get(itemId) || actor.items.get(itemId) || (itemId ? fromUuidSync(itemId) : null);
        if (item) {
          item.sheet.render(true);
        } else {
          ui.notifications.error("Item not found.");
        }
      } catch (error) {
        console.error("Details error:", error);
        ui.notifications.error("Failed to open item details");
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

  // Process each slot
  for (let i = 0; i < 3; i++) {
    const slotKey = i.toString();
    const itemId = cauldronSlots[slotKey];
    
    if (itemId) {
      try {
        // Try to resolve the item - first from UUID, then game items, then actor items
        const item = await fromUuid(itemId) || game.items.get(itemId) || actor.items.get(itemId);
        
        if (item) {
          resolvedSlots[i] = item.img;
          reagentNames[i] = item.name || "Unknown Reagent";
          
          // Get IP values from the item
          const flags = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
          ipSums.combat += flags.combat || 0;
          ipSums.utility += flags.utility || 0;
          ipSums.entropy += flags.entropy || 0;
        } else {
          resolvedSlots[i] = null;
          reagentNames[i] = "Item Not Found";
          allSlotsFilled = false;
        }
      } catch (error) {
        console.error(`Error resolving item for slot ${i}:`, error);
        resolvedSlots[i] = null;
        reagentNames[i] = "Error Loading Item";
        allSlotsFilled = false;
      }
    } else {
      resolvedSlots[i] = null;
      reagentNames[i] = "Drop Reagent";
      allSlotsFilled = false;
    }
  }

  const highlight = { combat: false, utility: false, entropy: false };
  let outcomeIcons = [];

  // Only process outcomes if all slots are filled
  if (allSlotsFilled) {
    try {
      // Find the highest value category(s)
      const sums = [
        { category: 'combat', value: ipSums.combat },
        { category: 'utility', value: ipSums.utility },
        { category: 'entropy', value: ipSums.entropy }
      ];
      
      const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
      const highestCategories = sums.filter(sum => sum.value === maxSum);

      // Highlight the highest categories
      highestCategories.forEach(({ category }) => {
        highlight[category] = true;
      });

      // Get consumable outcomes and selected outcome
      const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes') || {};
      const selectedOutcome = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome') || null;

      // Map outcome icons for display
      outcomeIcons = await Promise.all(highestCategories.map(async ({ category, value: sum }) => {
        const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
        const itemUuid = outcomes[capitalizedCategory]?.[sum] || null;
        
        let itemImg = 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png';
        let outcomeName = `Unknown ${capitalizedCategory} ${sum}`;
        let hasItem = false;
        let itemId = null;

        if (itemUuid) {
          try {
            const item = await fromUuid(itemUuid);
            if (item) {
              itemId = item.id;
              itemImg = item.img;
              outcomeName = item.name || outcomeName;
              hasItem = true;
            }
          } catch (error) {
            console.error(`Error resolving outcome item for ${category} ${sum}:`, error);
          }
        }

        // Check if this is the selected outcome
        const isSelected = selectedOutcome && 
                          selectedOutcome.category === category && 
                          selectedOutcome.sum === sum;
        
        return { 
          category, 
          sum, 
          img: itemImg, 
          outcomeName, 
          itemId, 
          hasItem, 
          isSelected 
        };
      }));
    } catch (error) {
      console.error("Error preparing outcome icons:", error);
      outcomeIcons = [];
    }
  }

  return {
    cauldronSlots: resolvedSlots,
    reagentNames: reagentNames,
    ipSums: ipSums,
    highlight: highlight,
    outcomeIcons: outcomeIcons,
    allSlotsFilled: allSlotsFilled
  };
}
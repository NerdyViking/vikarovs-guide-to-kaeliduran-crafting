import { highlightOutcome } from './alchemyInterfaceCompendium.js';
import { performCrafting } from './alchemyCrafting.js';
import { isReagent } from '../shared/utils.js';

export async function prepareCauldronData(actor) {
  if (!actor) {
    console.log("No actor provided, returning default cauldron data");
    return {
      slots: [
        { img: null, name: "Drop Reagent", hasItem: false },
        { img: null, name: "Drop Reagent", hasItem: false },
        { img: null, name: "Drop Reagent", hasItem: false }
      ],
      ipSums: { combat: 0, utility: 0, entropy: 0 },
      highlight: { combat: false, utility: false, entropy: false },
      outcomeIcons: []
    };
  }

  const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
  const slots = [];
  let ipSums = { combat: 0, utility: 0, entropy: 0 };
  let allSlotsFilled = true;

  for (let i = 0; i < 3; i++) {
    const itemUuid = cauldronSlots[i.toString()];
    if (itemUuid) {
      try {
        const item = await fromUuid(itemUuid);
        if (item && item.testUserPermission(game.user, "OBSERVER")) {
          slots[i] = {
            img: item.img || 'icons/svg/mystery-man.svg',
            name: item.name || "Unknown Reagent",
            hasItem: true
          };
          const flags = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
          ipSums.combat += flags.combat || 0;
          ipSums.utility += flags.utility || 0;
          ipSums.entropy += flags.entropy || 0;
        } else {
          console.warn(`Failed to resolve item with UUID: ${itemUuid} for slot ${i}. Item:`, item, `User permissions:`, game.user);
          const itemId = itemUuid.split('.').pop();
          let fallbackItem = actor.items.get(itemId) || game.items.get(itemId);
          if (fallbackItem && isReagent(fallbackItem)) {
            slots[i] = {
              img: fallbackItem.img || 'icons/svg/mystery-man.svg',
              name: fallbackItem.name || "Unknown Reagent",
              hasItem: true
            };
            const flags = fallbackItem.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
            ipSums.combat += flags.combat || 0;
            ipSums.utility += flags.utility || 0;
            ipSums.entropy += flags.entropy || 0;
          } else {
            console.warn(`Fallback failed for UUID: ${itemUuid}, slot ${i}`);
            slots[i] = {
              img: null,
              name: "Unknown Reagent",
              hasItem: false
            };
            allSlotsFilled = false;
          }
        }
      } catch (error) {
        console.error(`Error resolving UUID ${itemUuid} for slot ${i}:`, error);
        slots[i] = {
          img: null,
          name: "Unknown Reagent",
          hasItem: false
        };
        allSlotsFilled = false;
      }
    } else {
      slots[i] = {
        img: null,
        name: "Drop Reagent",
        hasItem: false
      };
      allSlotsFilled = false;
    }
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

    const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(actor.id);
    const groupId = actorGroups.length > 0 ? actorGroups[0].id : null;
    const craftingMemory = groupId
      ? (game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {})[groupId] || { Combat: [], Utility: [], Entropy: [] }
      : { Combat: [], Utility: [], Entropy: [] };

    outcomeIcons = await Promise.all(highestCategories.map(async ({ category, value: sum }) => {
      const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
      const itemUuid = outcomes[capitalizedCategory][sum] || null;
      let itemImg = 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png';
      let outcomeName = `Unknown ${capitalizedCategory} ${sum}`;
      let hasItem = false;
      let itemId = null;
      const isUnknown = !craftingMemory[capitalizedCategory]?.includes(sum);

      if (itemUuid && !isUnknown) {
        const item = await fromUuid(itemUuid);
        if (item) {
          itemId = item.id;
          itemImg = item.img || 'icons/svg/mystery-man.svg';
          outcomeName = item.name || outcomeName;
          hasItem = true;
        }
      }

      const isSelected = selectedOutcome && selectedOutcome.category === category && selectedOutcome.sum === sum;
      return { category, sum, img: itemImg, outcomeName, itemId, hasItem, isSelected, isUnknown };
    }));
  }

  return {
    slots: slots,
    ipSums: ipSums,
    highlight: highlight,
    outcomeIcons: outcomeIcons
  };
}
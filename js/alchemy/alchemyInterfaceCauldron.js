import { highlightOutcome } from './alchemyInterfaceCompendium.js';
import { performCrafting } from './alchemyCrafting.js';
import { isReagent } from '../shared/utils.js';

export async function prepareCauldronData(actor) {
  if (!actor) {
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
    const itemUuid = cauldronSlots[i.toString()];
    if (itemUuid) {
      const item = await fromUuid(itemUuid);
      if (item) {
        resolvedSlots[i] = item.img;
        reagentNames[i] = item.name || "Unknown Reagent";
        const flags = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
        ipSums.combat += flags.combat || 0;
        ipSums.utility += flags.utility || 0;
        ipSums.entropy += flags.entropy || 0;
      } else {
        resolvedSlots[i] = null;
        reagentNames[i] = "Unknown Reagent";
        allSlotsFilled = false;
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

    // Fetch crafting memory to determine if outcomes are known
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
          itemImg = item.img;
          outcomeName = item.name || outcomeName;
          hasItem = true;
        }
      }

      const isSelected = selectedOutcome && selectedOutcome.category === category && selectedOutcome.sum === sum;
      return { category, sum, img: itemImg, outcomeName, itemId, hasItem, isSelected, isUnknown };
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
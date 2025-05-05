import { highlightOutcome } from './alchemyInterfaceCompendium.js';
import { isReagent } from '../shared/utils.js';

// Prepares the cauldron data for the Alchemy Interface, including slots, IP sums, and crafting outcomes
export async function prepareCauldronData(actor) {
  if (!actor) {
    return {
      slots: [
        { img: null, name: "Drop Reagent", hasItem: false },
        { img: null, name: "Drop Reagent", hasItem: false },
        { img: null, name: "Drop Reagent", hasItem: false }
      ],
      ipSums: { combat: 0, utility: 0, entropy: 0 },
      highlight: { combat: false, utility: false, entropy: false },
      outcomeIcons: [],
      goldCost: 0,
      baseQuantity: 1,
      quantityBreakdown: []
    };
  }

  const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
  const slots = [];
  let ipSums = { combat: 0, utility: 0, entropy: 0 };
  let allSlotsFilled = true;
  const reagents = [];

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
          reagents[i] = item;
        } else {
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
            reagents[i] = fallbackItem;
          } else {
            slots[i] = {
              img: null,
              name: "Unknown Reagent",
              hasItem: false
            };
            allSlotsFilled = false;
          }
        }
      } catch (error) {
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
  let goldCost = 0;
  let baseQuantity = 1;
  let quantityBreakdown = [];

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

    // Calculate gold cost and quantity
    const rarity = getRarityFromSum(maxSum);
    goldCost = getBaseGoldCost(rarity);
    const quantityData = await calculateBaseQuantity(reagents, rarity);
    baseQuantity = quantityData.quantity;
    quantityBreakdown = quantityData.breakdown;
  }

  return {
    slots: slots,
    ipSums: ipSums,
    highlight: highlight,
    outcomeIcons: outcomeIcons,
    goldCost: goldCost,
    baseQuantity: baseQuantity,
    quantityBreakdown: quantityBreakdown
  };
}

// Converts IP sum to item rarity based on predefined ranges
function getRarityFromSum(sum) {
  if (sum >= 31) return "Legendary";
  if (sum >= 28) return "Very Rare";
  if (sum >= 22) return "Rare";
  if (sum >= 13) return "Uncommon";
  return "Common";
}

// Retrieves the flat gold cost for crafting based on rarity
function getBaseGoldCost(rarity) {
  const costMap = { Common: 50, Uncommon: 200, Rare: 2000, "Very Rare": 20000, Legendary: 100000 };
  return costMap[rarity] || 50;
}

// Calculates the base quantity of consumables and breakdown based on reagent rarities
async function calculateBaseQuantity(reagents, outcomeRarity) {
  const rarityTiers = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
  const outcomeTier = rarityTiers.indexOf(outcomeRarity);
  let quantity = 1;
  const breakdown = [];

  for (const reagent of reagents) {
    if (!reagent) {
      breakdown.push({ name: "Unknown Reagent", bonus: 0 });
      continue;
    }
    let reagentRarity = reagent.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'rarity');
    if (!reagentRarity) {
      reagentRarity = reagent.system.rarity || "Common";
      reagentRarity = reagentRarity.charAt(0).toUpperCase() + reagentRarity.slice(1).toLowerCase();
    }
    const reagentTier = rarityTiers.indexOf(reagentRarity);
    let bonus = 0;
    if (reagentTier > outcomeTier) {
      bonus = reagentTier - outcomeTier;
      quantity += bonus;
    }
    breakdown.push({ name: reagent.name || "Unknown Reagent", bonus });
  }

  return { quantity: Math.max(1, quantity), breakdown };
}
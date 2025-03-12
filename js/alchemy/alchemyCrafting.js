// js/alchemy/alchemyCrafting.js
import { getCompendiumItem } from './alchemyInterfaceCompendium.js';

export async function performCrafting(actor, cauldronSlots, ipSums, selectedOutcome = null) {
  // Validation
  if (!cauldronSlots || Object.values(cauldronSlots).filter(id => id).length !== 3) {
    ui.notifications.warn("Please fill all three cauldron slots with reagents.");
    return { success: false, message: "Crafting aborted: Insufficient reagents." };
  }
  if (!actor.system.currency || actor.system.currency.gp === undefined) {
    ui.notifications.warn("Actor has no gold data.");
    return { success: false, message: "Crafting aborted: No gold data." };
  }

  // Step 1: Determine Crafting DC
  const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
  let category = selectedOutcome?.category || Object.keys(ipSums).find(cat => ipSums[cat] === maxSum);
  if (!category) category = "combat"; // Default to combat if no tiebreaker and no clear max
  const rarity = getRarityFromSum(maxSum);
  const dc = getDcFromRarity(rarity);

  // Step 2: Check Tool Availability
  const tools = actor.items.filter(item => item.type === "tool" && (item.system.identifier === "alchemist" || item.system.identifier === "herbalism"));
  if (tools.length === 0) {
    ui.notifications.warn("You need Alchemist's Supplies or Herbalism Kit to craft!");
    return { success: false, message: "Crafting aborted: Missing tool." };
  }
  const tool = tools.find(t => t.system.identifier === "alchemist") || tools[0]; // Prioritize Alchemist's Supplies

  // Step 3: Perform Tool Check with tool.rollToolCheck
  const roll = await tool.rollToolCheck({
    dc: dc, // Pass the crafting DC
    rollMode: "roll", // Public roll by default
    fastForward: false, // Show dialog for ability selection
    flavor: `Crafting Tool Check (DC ${dc}) using ${tool.name}`
  });
  if (!roll || !roll[0]) {
    return { success: false, message: "Crafting aborted: Roll cancelled or invalid." };
  }
  const total = roll[0].total;
  const margin = total - dc;

  // Step 4: Evaluate Roll Outcome
  let finalSum = maxSum;
  let finalCategory = category;
  let quantity = 1;
  if (margin >= 10) {
    quantity = 2;
  } else if (margin < 0) {
    const reductionDice = margin <= -10 ? "2d4" : "1d4";
    const reductionRoll = new Roll(reductionDice);
    await reductionRoll.evaluate(); // Asynchronous evaluation
    const reduction = Math.max(1, reductionRoll.total); // Ensure at least 1 reduction
    finalSum = Math.max(1, maxSum - reduction);

    // Recalculate category if sums change
    const newIpSums = { ...ipSums };
    newIpSums[category] = finalSum;
    const newMaxSum = Math.max(newIpSums.combat, newIpSums.utility, newIpSums.entropy);
    finalCategory = selectedOutcome?.category || Object.keys(newIpSums).find(cat => newIpSums[cat] === newMaxSum) || "combat";
  }

  // Step 5: Create or Update Consumable
  const finalRarity = getRarityFromSum(finalSum);
  const linkedItemId = getCompendiumItem(finalCategory, finalSum);
  let itemData = linkedItemId ? await fromUuid(linkedItemId) : createPlaceholderItem(finalRarity, finalCategory);
  if (!itemData) {
    ui.notifications.error("Failed to create consumable item.");
    return { success: false, message: "Crafting aborted: Item creation failed." };
  }
  // Only call toObject if itemData is a Foundry data object
  if (typeof itemData.toObject === 'function') {
    itemData = itemData.toObject();
  }

  // Check if the item already exists in the inventory
  const existingItem = actor.items.find(i => i.name === itemData.name && i.type === "consumable");
  if (existingItem) {
    // If the item exists, increase its quantity by the calculated amount
    const newQuantity = (existingItem.system.quantity || 0) + quantity;
    await existingItem.update({ "system.quantity": newQuantity });
  } else {
    // If the item doesn't exist, create a new one with the calculated quantity
    itemData.system.quantity = quantity;
    await actor.createEmbeddedDocuments("Item", [itemData]);
  }

  // Step 6: Consume Resources
  const baseGoldCost = getBaseGoldCost(rarity);
  const reagentCosts = await calculateReagentCosts(actor, cauldronSlots);
  const baseCost = Math.max(0, baseGoldCost - reagentCosts);
  const minGoldCost = baseGoldCost * 0.1;
  const finalGoldCost = Math.max(minGoldCost, baseCost);
  if (actor.system.currency.gp < finalGoldCost) {
    ui.notifications.warn(`Insufficient gold! Need ${finalGoldCost} gp, have ${actor.system.currency.gp} gp.`);
    return { success: false, message: "Crafting aborted: Insufficient gold." };
  }
  const consumeResult = await consumeResources(actor, cauldronSlots, finalGoldCost);

  // If any reagent was consumed to zero, clear the cauldron slots
  if (consumeResult.resetSlots) {
    await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', { 0: null, 1: null, 2: null });
    await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
  }

  // Return result for feedback
  const itemName = itemData.name || `Unknown ${finalRarity} ${finalCategory} Consumable`;
  return {
    success: true,
    category: finalCategory,
    sum: finalSum,
    quantity,
    item: itemData,
    message: `Tool Check: ${total} vs DC ${dc} (${margin >= 0 ? "Success" : "Failed"}). ${margin >= 10 ? "Crafted 2" : "Crafted 1"} '${itemName}'.${margin < 0 ? ` Reduced ${category} ${maxSum} to ${finalSum}, shifted to ${finalCategory} ${finalSum}.` : ""}`
  };

  // Helper functions
  function getRarityFromSum(sum) {
    if (sum >= 31) return "Legendary";
    if (sum >= 28) return "Very Rare";
    if (sum >= 22) return "Rare";
    if (sum >= 13) return "Uncommon";
    return "Common";
  }

  function getDcFromRarity(rarity) {
    const dcMap = { Common: 10, Uncommon: 15, Rare: 20, "Very Rare": 25, Legendary: 30 };
    return dcMap[rarity] || 10;
  }

  function getBaseGoldCost(rarity) {
    const costMap = { Common: 50, Uncommon: 200, Rare: 2000, "Very Rare": 20000, Legendary: 100000 };
    return costMap[rarity] || 50;
  }

  async function calculateReagentCosts(actor, slots) {
    let totalCost = 0;
    for (const slotId of Object.values(slots)) {
      if (slotId) {
        const item = actor.items.get(slotId) || (await fromUuid(slotId));
        if (item) {
          const rarity = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'rarity') || "Common";
          const costMap = { Common: 10, Uncommon: 50, Rare: 600, "Very Rare": 6000, Legendary: 50000 };
          totalCost += costMap[rarity] || 10;
        }
      }
    }
    return totalCost;
  }

  async function consumeResources(actor, slots, goldCost) {
    let resetSlots = false; // Flag to indicate if we need to reset cauldron slots

    // Deduct gold
    await actor.update({ "system.currency.gp": actor.system.currency.gp - goldCost });

    // Consume reagents and check if any are reduced to zero
    for (const slotId of Object.values(slots)) {
      if (slotId) {
        const item = actor.items.get(slotId) || (await fromUuid(slotId));
        if (item) {
          const newQuantity = (item.system.quantity || 1) - 1;
          if (newQuantity <= 0) {
            await item.delete();
            resetSlots = true; // Mark that a reagent was consumed to zero
          } else {
            await item.update({ "system.quantity": newQuantity });
          }
        }
      }
    }

    return { resetSlots };
  }

  function createPlaceholderItem(rarity, category) {
    return {
      name: `${rarity} ${category.charAt(0).toUpperCase() + category.slice(1)} Consumable`,
      type: "consumable",
      img: "icons/svg/mystery-man.svg",
      system: {
        description: { value: "A placeholder consumable crafted via alchemy." },
        quantity: 0,
        uses: { value: 1, max: 1 },
        rarity: rarity
      }
    };
  }
}
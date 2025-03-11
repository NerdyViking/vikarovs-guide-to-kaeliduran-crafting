// js/alchemy/alchemyCrafting.js
import { getCompendiumItem } from './alchemyInterfaceCompendium.js';

export async function performCrafting(actor, cauldronSlots, ipSums, selectedOutcome = null) {
  console.log("Starting performCrafting with actor:", actor.name, "cauldronSlots:", cauldronSlots, "ipSums:", ipSums, "selectedOutcome:", selectedOutcome);

  // Validation
  if (!cauldronSlots || Object.values(cauldronSlots).filter(id => id).length !== 3) {
    ui.notifications.warn("Please fill all three cauldron slots with reagents.");
    console.log("Validation failed: Insufficient reagents.");
    return { success: false, message: "Crafting aborted: Insufficient reagents." };
  }
  if (!actor.system.currency || actor.system.currency.gp === undefined) {
    ui.notifications.warn("Actor has no gold data.");
    console.log("Validation failed: No gold data.");
    return { success: false, message: "Crafting aborted: No gold data." };
  }
  console.log("Validation passed.");

  // Step 1: Determine Crafting DC
  const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
  let category = selectedOutcome?.category || Object.keys(ipSums).find(cat => ipSums[cat] === maxSum);
  if (!category) category = "combat"; // Default to combat if no tiebreaker and no clear max
  const rarity = getRarityFromSum(maxSum);
  const dc = getDcFromRarity(rarity);
  console.log("Step 1: DC determined - maxSum:", maxSum, "category:", category, "rarity:", rarity, "dc:", dc);

  // Step 2: Check Tool Availability
  const tools = actor.items.filter(item => item.type === "tool" && (item.system.identifier === "alchemist" || item.system.identifier === "herbalism"));
  if (tools.length === 0) {
    ui.notifications.warn("You need Alchemist's Supplies or Herbalism Kit to craft!");
    console.log("Step 2: No tools found.");
    return { success: false, message: "Crafting aborted: Missing tool." };
  }
  const tool = tools.find(t => t.system.identifier === "alchemist") || tools[0]; // Prioritize Alchemist's Supplies
  console.log("Step 2: Tool selected:", tool.name, "toolId:", tool.system.identifier);

  // Step 3: Perform Tool Check with tool.rollToolCheck
  console.log("Step 3: Initiating tool check with DC:", dc, "tool:", tool.name);
  const roll = await tool.rollToolCheck({
    dc: dc, // Pass the crafting DC
    rollMode: "roll", // Public roll by default
    fastForward: false, // Show dialog for ability selection
    flavor: `Crafting Tool Check (DC ${dc}) using ${tool.name}`
  });
  if (!roll || !roll[0]) {
    console.log("Step 3: Roll failed or cancelled, roll:", roll);
    return { success: false, message: "Crafting aborted: Roll cancelled or invalid." };
  }
  const total = roll[0].total;
  const margin = total - dc;
  console.log("Step 3: Roll completed - total:", total, "margin:", margin);

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
  console.log("Step 4: Roll evaluated - finalSum:", finalSum, "finalCategory:", finalCategory, "quantity:", quantity);

  // Step 5: Create or Update Consumable
  const finalRarity = getRarityFromSum(finalSum);
  const linkedItemId = getCompendiumItem(finalCategory, finalSum);
  console.log("Step 5: Attempting to get linked item - finalCategory:", finalCategory, "finalSum:", finalSum, "linkedItemId:", linkedItemId);
  let itemData = linkedItemId ? await fromUuid(linkedItemId) : createPlaceholderItem(finalRarity, finalCategory);
  console.log("Step 5: Item data after fetch - itemData:", itemData);
  if (!itemData) {
    ui.notifications.error("Failed to create consumable item.");
    console.log("Step 5: Item creation failed - itemData is null or undefined.");
    return { success: false, message: "Crafting aborted: Item creation failed." };
  }
  // Only call toObject if itemData is a Foundry data object
  if (typeof itemData.toObject === 'function') {
    itemData = itemData.toObject();
    console.log("Step 5: Item data after toObject - itemData:", itemData);
  } else {
    console.log("Step 5: Item data is a plain object, skipping toObject - itemData:", itemData);
  }

  // Check if the item already exists in the inventory
  const existingItem = actor.items.find(i => i.name === itemData.name && i.type === "consumable");
  if (existingItem) {
    // If the item exists, increase its quantity by the calculated amount
    const newQuantity = (existingItem.system.quantity || 0) + quantity;
    console.log("Step 5: Found existing item - existingItem:", existingItem.id, "updating quantity to:", newQuantity);
    await existingItem.update({ "system.quantity": newQuantity });
  } else {
    // If the item doesn't exist, create a new one with the calculated quantity
    itemData.system.quantity = quantity;
    console.log("Step 5: Creating new item - itemData:", itemData);
    await actor.createEmbeddedDocuments("Item", [itemData]);
  }
  console.log("Step 5: Consumable creation or update completed.");

  // Step 6: Consume Resources
  const baseGoldCost = getBaseGoldCost(rarity);
  const reagentCosts = await calculateReagentCosts(actor, cauldronSlots);
  const baseCost = Math.max(0, baseGoldCost - reagentCosts);
  const minGoldCost = baseGoldCost * 0.1;
  const finalGoldCost = Math.max(minGoldCost, baseCost);
  if (actor.system.currency.gp < finalGoldCost) {
    ui.notifications.warn(`Insufficient gold! Need ${finalGoldCost} gp, have ${actor.system.currency.gp} gp.`);
    console.log("Step 6: Insufficient gold.");
    return { success: false, message: "Crafting aborted: Insufficient gold." };
  }
  await consumeResources(actor, cauldronSlots, finalGoldCost);
  console.log("Step 6: Resources consumed - finalGoldCost:", finalGoldCost);

  // Return result for feedback
  const itemName = itemData.name || `Unknown ${finalRarity} ${finalCategory} Consumable`;
  console.log("Step 6: Returning result - itemName:", itemName);
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
    await actor.update({ "system.currency.gp": actor.system.currency.gp - goldCost });
    for (const slotId of Object.values(slots)) {
      if (slotId) {
        const item = actor.items.get(slotId) || (await fromUuid(slotId));
        if (item) {
          const newQuantity = (item.system.quantity || 1) - 1;
          if (newQuantity <= 0) {
            await item.delete();
          } else {
            await item.update({ "system.quantity": newQuantity });
          }
        }
      }
    }
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
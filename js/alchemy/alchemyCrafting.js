import { getCompendiumItem } from './alchemyInterfaceCompendium.js';

export async function performCrafting(actor, cauldronSlots, ipSums, selectedOutcome = null) {
  if (!cauldronSlots || Object.values(cauldronSlots).filter(uuid => uuid).length !== 3) {
    ui.notifications.warn("Please fill all three cauldron slots with reagents.");
    return { success: false, message: "Crafting aborted: Insufficient reagents." };
  }
  if (!actor.system.currency || actor.system.currency.gp === undefined) {
    ui.notifications.warn("Actor has no gold data.");
    return { success: false, message: "Crafting aborted: No gold data." };
  }

  const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
  let category = selectedOutcome?.category || Object.keys(ipSums).find(cat => ipSums[cat] === maxSum);
  if (!category) category = "combat";
  const rarity = getRarityFromSum(maxSum);
  const dc = getDcFromRarity(rarity);

  const tools = actor.items.filter(item => {
    if (item.type !== "tool") return false;
    const identifier = item.system.type?.baseItem || item.system.identifier;
    const validIdentifiers = ["alchemist", "alchemistSupplies", "alchemistsSupplies", "herbalismKit"];
    return validIdentifiers.includes(identifier);
  });

  if (tools.length === 0) {
    ui.notifications.warn("You need Alchemist's Supplies or Herbalism Kit to craft!");
    return { success: false, message: "Crafting aborted: Missing tool." };
  }
  const tool = tools[0];

  const roll = await tool.rollToolCheck({
    dc: dc,
    rollMode: "roll",
    fastForward: false,
    flavor: `Crafting Tool Check (DC ${dc}) using ${tool.name}`
  });
  if (!roll || !roll[0]) {
    return { success: false, message: "Crafting aborted: Roll cancelled or invalid." };
  }
  const total = roll[0].total;
  const margin = total - dc;

  let finalSum = maxSum;
  let finalCategory = category;
  let quantity = 1;
  if (margin >= 10) {
    quantity = 2;
  } else if (margin < 0) {
    const reductionDice = margin <= -10 ? "2d4" : "1d4";
    const reductionRoll = new Roll(reductionDice);
    await reductionRoll.evaluate();
    const reduction = Math.max(1, reductionRoll.total);
    finalSum = Math.max(1, maxSum - reduction);

    const newIpSums = { ...ipSums };
    newIpSums[category] = finalSum;
    const newMaxSum = Math.max(newIpSums.combat, newIpSums.utility, newIpSums.entropy);
    finalCategory = selectedOutcome?.category || Object.keys(newIpSums).find(cat => newIpSums[cat] === newMaxSum) || "combat";
  }

  const finalRarity = getRarityFromSum(finalSum);
  const linkedItemId = getCompendiumItem(finalCategory, finalSum);
  let itemData = linkedItemId ? await fromUuid(linkedItemId) : createPlaceholderItem(finalRarity, finalCategory);
  if (!itemData) {
    ui.notifications.error("Failed to create consumable item.");
    return { success: false, message: "Crafting aborted: Item creation failed." };
  }
  if (typeof itemData.toObject === 'function') {
    itemData = itemData.toObject();
  }

  const existingItem = actor.items.find(i => i.name === itemData.name && i.type === "consumable");
  let item;
  try {
    if (existingItem) {
      const newQuantity = (existingItem.system.quantity || 0) + quantity;
      await existingItem.update({ "system.quantity": newQuantity });
      item = existingItem;
    } else {
      itemData.system.quantity = quantity;
      const createdItems = await actor.createEmbeddedDocuments("Item", [itemData]);
      if (!createdItems || createdItems.length === 0) {
        throw new Error("Failed to create item: No items returned from createEmbeddedDocuments.");
      }
      item = createdItems[0];
    }
  } catch (error) {
    console.error("Error creating or updating item:", error);
    return { success: false, message: `Crafting aborted: Failed to create or update item - ${error.message}` };
  }

  if (!item) {
    console.error("Item is undefined after creation/update.");
    return { success: false, message: "Crafting aborted: Item creation resulted in undefined item." };
  }

  // Update permissions for the source item in the sidebar or compendium
  if (linkedItemId) {
    try {
      const sourceItem = await fromUuid(linkedItemId);
      if (sourceItem) {
        const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(actor.id);
        const group = actorGroups.length > 0 ? actorGroups[0] : null;
        if (group) {
          const members = group.system.members || [];
          const permissionUpdates = {};
          for (const member of members) {
            if (member.actor?.uuid) {
              const memberActor = await fromUuid(member.actor.uuid);
              if (memberActor) {
                permissionUpdates[memberActor.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
              }
            }
          }
          // Ensure the crafting actor and GM retain ownership
          permissionUpdates[actor.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
          permissionUpdates[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
          await sourceItem.update({ permission: permissionUpdates });
        }
      } else {
        console.warn("Source item not found for permission update:", linkedItemId);
      }
    } catch (error) {
      console.error("Error updating source item permissions:", error);
      return { success: false, message: `Crafting aborted: Failed to update source item permissions - ${error.message}` };
    }
  }

  const baseGoldCost = getBaseGoldCost(rarity);
  const reagentCosts = await calculateReagentCosts(actor, cauldronSlots);
  const baseCost = Math.max(0, baseGoldCost - reagentCosts);
  const minGoldCost = baseGoldCost * 0.1;
  const finalGoldCost = Math.max(minGoldCost, baseCost);
  if (actor.system.currency.gp < finalGoldCost) {
    ui.notifications.warn(`Insufficient gold! Need ${finalGoldCost} gp, have ${actor.system.currency.gp} gp.`);
    return { success: false, message: "Crafting aborted: Insufficient gold." };
  }
  await consumeResources(actor, cauldronSlots, finalGoldCost);

  const itemName = itemData.name || `Unknown ${finalRarity} ${finalCategory} Consumable`;
  try {
    await ChatMessage.create({
      content: itemName,
      speaker: ChatMessage.getSpeaker({ actor }),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  } catch (error) {
    console.error("Error creating chat message:", error);
    // Continue despite chat message failure, as it's not critical to crafting
  }

  return {
    success: true,
    category: finalCategory,
    sum: finalSum,
    quantity,
    item: itemData,
    message: `Tool Check: ${total} vs DC ${dc} (${margin >= 0 ? "Success" : "Failed"}). ${margin >= 10 ? "Crafted 2" : "Crafted 1"} '${itemName}'.${margin < 0 ? ` Reduced ${category} ${maxSum} to ${finalSum}, shifted to ${finalCategory} ${finalSum}.` : ""}`
  };

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
    for (const slotUuid of Object.values(slots)) {
      if (slotUuid) {
        const item = await fromUuid(slotUuid);
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
    for (const slotUuid of Object.values(slots)) {
      if (slotUuid) {
        const item = await fromUuid(slotUuid);
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
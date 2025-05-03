import { getCompendiumItem } from './alchemyInterfaceCompendium.js';

// Perform crafting for an actor, handling reagents, tool checks, and outcome creation
export async function performCrafting(actor, cauldronSlots, ipSums, selectedOutcome = null) {
  // Validate cauldron slots and actor gold data
  if (!cauldronSlots || Object.values(cauldronSlots).filter(uuid => uuid).length !== 3) {
    ui.notifications.warn("Please fill all three cauldron slots with reagents.");
    return { success: false, message: "Crafting aborted: Insufficient reagents." };
  }
  if (!actor.system.currency || actor.system.currency.gp === undefined) {
    ui.notifications.warn("Actor has no gold data.");
    return { success: false, message: "Crafting aborted: No gold data." };
  }

  // Determine crafting category and difficulty based on IP sums
  const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
  let category = selectedOutcome?.category || Object.keys(ipSums).find(cat => ipSums[cat] === maxSum);
  if (!category) category = "combat";
  const rarity = getRarityFromSum(maxSum);
  const dc = getDcFromRarity(rarity);

  // Check for required crafting tools
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

  // Perform tool check roll to determine crafting success
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

  // Adjust outcome based on tool check margin
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

  // Create or fetch the crafted item based on the outcome
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

  // Add the crafted item to the actor’s inventory or update quantity if it exists
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

  // Update ownership for the source item to grant LIMITED access to campaign users
  if (linkedItemId) {
    const sourceItem = await fromUuid(linkedItemId);
    if (sourceItem) {
      const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(actor.id);
      const group = actorGroups.length > 0 ? actorGroups[0] : null;
      if (group) {
        const members = group.system.members || [];
        const ownershipUpdates = {};

        // Map campaign actors to users and set LIMITED access for those with NONE access
        for (const member of members) {
          if (member.actor?.uuid) {
            const memberActor = await fromUuid(member.actor.uuid);
            if (memberActor) {
              const owningUsers = game.users.filter(user => memberActor.testUserPermission(user, "OWNER"));
              for (const user of owningUsers) {
                const currentPermission = sourceItem.testUserPermission(user, "LIMITED") ? 1 : 0;
                if (currentPermission === 0) {
                  ownershipUpdates[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
                }
              }
            }
          }
        }

        // Apply the ownership updates
        try {
          if (game.user.isGM) {
            // GM updates directly
            await sourceItem.update({ ownership: ownershipUpdates });
          } else {
            // Player emits a socket event for the GM to update
            await game.socket.emit('module.vikarovs-guide-to-kaeliduran-crafting', {
              operation: "updateItemPermissions",
              payload: { itemUuid: linkedItemId, ownershipUpdates }
            });
          }
        } catch (error) {
          console.error("Error updating source item ownership:", error);
          return { success: false, message: `Crafting aborted: Failed to update source item ownership - ${error.message}` };
        }
      }
    }
  }

  // Calculate and consume crafting costs (gold and reagents)
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

  // Send a chat message with the crafting result
  const itemName = itemData.name || `Unknown ${finalRarity} ${finalCategory} Consumable`;
  try {
    await ChatMessage.create({
      content: `<p>${itemName}</p>`,
      speaker: ChatMessage.getSpeaker({ actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  } catch (error) {
    console.error("Error creating chat message:", error);
    // Continue despite chat message failure, as it's not critical to crafting
  }

  // Return the crafting result
  return {
    success: true,
    category: finalCategory,
    sum: finalSum,
    quantity,
    item: itemData,
    message: `Tool Check: ${total} vs DC ${dc} (${margin >= 0 ? "Success" : "Failed"}). ${margin >= 10 ? "Crafted 2" : "Crafted 1"} '${itemName}'.${margin < 0 ? ` Reduced ${category} ${maxSum} to ${finalSum}, shifted to ${finalCategory} ${finalSum}.` : ""}`
  };
}

// Utility Functions

// Convert IP sum to item rarity
function getRarityFromSum(sum) {
  if (sum >= 31) return "Legendary";
  if (sum >= 28) return "Very Rare";
  if (sum >= 22) return "Rare";
  if (sum >= 13) return "Uncommon";
  return "Common";
}

// Get the crafting DC based on item rarity
function getDcFromRarity(rarity) {
  const dcMap = { Common: 10, Uncommon: 15, Rare: 20, "Very Rare": 25, Legendary: 30 };
  return dcMap[rarity] || 10;
}

// Calculate the base gold cost for crafting based on rarity
function getBaseGoldCost(rarity) {
  const costMap = { Common: 50, Uncommon: 200, Rare: 2000, "Very Rare": 20000, Legendary: 100000 };
  return costMap[rarity] || 50;
}

// Calculate the total gold value of reagents in the cauldron slots
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

// Consume gold and reagents from the actor after crafting
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

// Create a placeholder consumable item if no linked item is found
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
import { getCompendiumItem } from './alchemyInterfaceCompendium.js';

// Performs the crafting process for an actor, handling reagents, tool checks, and item creation
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

  // Calculate base quantity based on reagent rarities
  const reagents = await Promise.all(Object.values(cauldronSlots).map(async uuid => await fromUuid(uuid)));
  const reagentNames = reagents.map(item => item?.name || "Unknown Reagent").join(", ");
  const baseQuantity = await calculateBaseQuantity(reagents, rarity);

  // Get flat gold cost based on rarity
  const finalGoldCost = getBaseGoldCost(rarity);
  if (actor.system.currency.gp < finalGoldCost) {
    ui.notifications.warn(`Insufficient gold! Need ${finalGoldCost} gp, have ${actor.system.currency.gp} gp.`);
    return { success: false, message: "Crafting aborted: Insufficient gold." };
  }

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

  // Perform tool check roll to determine crafting success, suppressing default chat message
  const roll = await tool.rollToolCheck({
    dc: dc,
    rollMode: "roll",
    fastForward: false,
    flavor: `Crafting Tool Check (DC ${dc}) using ${tool.name}`,
    chatMessage: false // Suppress the default tool check chat message
  });
  if (!roll || !roll[0]) {
    return { success: false, message: "Crafting aborted: Roll cancelled or invalid." };
  }
  const total = roll[0].total;
  const margin = total - dc;

  // Adjust outcome based on tool check margin
  let finalSum = maxSum;
  let finalCategory = category;
  let quantity = baseQuantity;
  if (margin >= 10) {
    quantity += 1; // Exceptional success: +1 consumable
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
      const currentQuantity = existingItem.system.quantity || 0;
      const newQuantity = currentQuantity + quantity;
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

  // Consume gold and reagents
  await consumeResources(actor, cauldronSlots, finalGoldCost);

  // Send a styled chat message with the crafting result
  const itemName = itemData.name || `Unknown ${finalRarity} ${finalCategory} Consumable`;
  let chatContent = `
    <div>
      <h3 style="margin: 0 0 5px 0">Crafting Result</h3>
      <p style="margin: 5px 0;">
        <strong>Outcome:</strong> Crafted ${quantity} <span>'${itemName}'</span> (Sum: ${finalSum})
      </p>
      <p style="margin: 5px 0;">
        <strong>Reagents Used:</strong>
        <ul style="margin: 5px 0 5px 20px; padding: 0; list-style-type: disc;">
          ${reagents.map(reagent => `<li>${reagent?.name || "Unknown Reagent"}</li>`).join('')}
        </ul>
      </p>
      <p style="margin: 5px 0;">
        <strong>Cost:</strong> ${finalGoldCost} gp
      </p>
  `;
  if (margin >= 10) {
    chatContent += `
      <p style="margin: 5px 0; color: #00ff00;">
        <strong>Exceptional Success!</strong> Gained +1 consumable (Total: ${quantity}).
      </p>
    `;
  } else if (margin < 0) {
    chatContent += `
      <p style="margin: 5px 0; color: #ff5555;">
        <strong>Failure:</strong> Outcome shifted to ${finalRarity} ${finalCategory} (Sum: ${finalSum}).
      </p>
    `;
  }
  chatContent += `</div>`;

  try {
    await ChatMessage.create({
      content: chatContent,
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
    message: `Tool Check: ${total} vs DC ${dc} (${margin >= 0 ? "Success" : "Failed"}). Crafted ${quantity} '${itemName}'${margin >= 10 ? " (+1 for exceptional success)" : ""}${margin < 0 ? ` Reduced ${category} ${maxSum} to ${finalSum}, shifted to ${finalCategory}.` : ""}. Cost: ${finalGoldCost} gp.`
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

// Determines the crafting DC based on the rarity of the outcome
function getDcFromRarity(rarity) {
  const dcMap = { Common: 10, Uncommon: 15, Rare: 20, "Very Rare": 25, Legendary: 30 };
  return dcMap[rarity] || 10;
}

// Retrieves the flat gold cost for crafting based on rarity
function getBaseGoldCost(rarity) {
  const costMap = { Common: 50, Uncommon: 200, Rare: 2000, "Very Rare": 20000, Legendary: 100000 };
  return costMap[rarity] || 50;
}

// Calculates the base quantity of consumables based on reagent rarities relative to the outcome rarity
async function calculateBaseQuantity(reagents, outcomeRarity) {
  const rarityTiers = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
  const outcomeTier = rarityTiers.indexOf(outcomeRarity);
  let quantity = 1;

  for (const reagent of reagents) {
    if (!reagent) continue;
    let reagentRarity = reagent.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'rarity');
    if (!reagentRarity) {
      reagentRarity = reagent.system.rarity || "Common";
      reagentRarity = reagentRarity.charAt(0).toUpperCase() + reagentRarity.slice(1).toLowerCase();
    }
    const reagentTier = rarityTiers.indexOf(reagentRarity);
    if (reagentTier > outcomeTier) {
      quantity += (reagentTier - outcomeTier);
    }
  }

  return Math.max(1, quantity);
}

// Deducts gold and consumes reagents from the actor after crafting
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

// Creates a placeholder consumable item if no linked item is found in the compendium
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
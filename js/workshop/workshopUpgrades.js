import { getRarityGoldCost } from '../shared/utils.js';

export async function upgradeWorkshop(actor, newTier) {
  const workshopData = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { tier: 1, exp: 0 };
  // Tier upgrade costs: 2x the base cost of a magic item of the corresponding rarity
  const costs = [
    0, // Tier 1 (no cost to start)
    getRarityGoldCost("uncommon") * 2, // Tier 2: 800 gp
    getRarityGoldCost("rare") * 2,     // Tier 3: 8000 gp
    getRarityGoldCost("veryRare") * 2, // Tier 4: 80000 gp
    getRarityGoldCost("legendary") * 2 // Tier 5: 400000 gp
  ];
  const expNeeded = newTier * 5; // 5 exp per tier (cumulative: 5, 10, 15, 20)

  // Check if the actor has enough gold and exp
  const currentGold = actor.system.currency?.gp || 0;
  if (workshopData.exp < expNeeded) {
    ui.notifications.warn(`Not enough experience to upgrade to Tier ${newTier}. Need ${expNeeded} exp, have ${workshopData.exp}.`);
    return false;
  }
  if (currentGold < costs[newTier]) {
    ui.notifications.warn(`Not enough gold to upgrade to Tier ${newTier}. Need ${costs[newTier]} gp, have ${currentGold}.`);
    return false;
  }

  // Deduct gold and update tier
  await actor.update({ "system.currency.gp": currentGold - costs[newTier] });
  await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", { ...workshopData, tier: newTier });
  ui.notifications.info(`Workshop upgraded to Tier ${newTier}!`);
  return true;
}

export async function switchWorkshopType(actor, newType) {
  const workshopData = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { tier: 1 };
  // Switching type costs the same as upgrading to the next tier
  const costs = [
    0, // Tier 1
    getRarityGoldCost("uncommon") * 2, // Tier 2: 800 gp
    getRarityGoldCost("rare") * 2,     // Tier 3: 8000 gp
    getRarityGoldCost("veryRare") * 2, // Tier 4: 80000 gp
    getRarityGoldCost("legendary") * 2 // Tier 5: 400000 gp
  ];
  const cost = costs[workshopData.tier + 1] || costs[costs.length - 1]; // Use next tier's cost, or max if at Tier 5
  const expNeeded = (workshopData.tier + 1) * 5; // Exp cost matches next tier

  // Check if the actor has enough gold and exp
  const currentGold = actor.system.currency?.gp || 0;
  if (workshopData.exp < expNeeded) {
    ui.notifications.warn(`Not enough experience to switch type. Need ${expNeeded} exp, have ${workshopData.exp}.`);
    return false;
  }
  if (currentGold < cost) {
    ui.notifications.warn(`Not enough gold to switch type. Need ${cost} gp, have ${currentGold}.`);
    return false;
  }

  // Deduct gold and update type (tier remains the same)
  await actor.update({ "system.currency.gp": currentGold - cost });
  await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", { ...workshopData, type: newType });
  ui.notifications.info(`Workshop type switched to ${newType}!`);
  return true;
}

export async function addCraftingExp(actor) {
  const workshopData = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { exp: 0 };
  const newExp = (workshopData.exp || 0) + 1;
  await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", { ...workshopData, exp: newExp });
  return newExp;
}

// GM-only function to add or subtract exp
export async function gmAddExp(actor, amount) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can modify crafting experience.");
    return false;
  }
  const workshopData = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { exp: 0 };
  const newExp = Math.max(0, (workshopData.exp || 0) + amount); // Prevent exp from going below 0
  await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", { ...workshopData, exp: newExp });
  if (amount >= 0) {
    ui.notifications.info(`Added ${amount} exp to ${actor.name}'s workshop. New exp: ${newExp}.`);
  } else {
    ui.notifications.info(`Removed ${Math.abs(amount)} exp from ${actor.name}'s workshop. New exp: ${newExp}.`);
  }
  return true;
}

// GM-only function to reset tier
export async function gmResetTier(actor) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can reset the workshop tier.");
    return false;
  }
  const workshopData = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { tier: 1 };
  await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", { ...workshopData, tier: 1 });
  ui.notifications.info(`Reset ${actor.name}'s workshop tier to 1.`);
  return true;
}

// GM-only function to reset type
export async function gmResetType(actor) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can reset the workshop type.");
    return false;
  }
  const workshopData = actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { type: "standard" };
  await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", { ...workshopData, type: "standard" });
  ui.notifications.info(`Reset ${actor.name}'s workshop type to Standard.`);
  return true;
}
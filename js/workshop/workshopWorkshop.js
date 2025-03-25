import { ComponentSelectorApplication } from './componentSelector.js';
import { addCraftingExp } from './workshopUpgrades.js';

export function handleWorkshopListeners(workshopInterface, html) {
  // Handle drag-and-drop for the component slot
  html.find('.workshop-component-wrapper.drop-zone').each((index, element) => {
    const $element = $(element);
    $element.on('dragover', (event) => {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    $element.on('drop', async (event) => {
      event.preventDefault();
      const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
      if (!data.type || !data.uuid) {
        ui.notifications.warn("Invalid item data.");
        return;
      }

      const item = await fromUuid(data.uuid);
      if (!item) {
        ui.notifications.warn("Item not found.");
        return;
      }

      // Validate that the item is a component
      const isComponent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent') === true;
      if (!isComponent) {
        ui.notifications.warn("Only components can be dropped into the crafting area.");
        return;
      }

      // Store the component
      workshopInterface.component = {
        name: item.name,
        uuid: item.uuid,
        img: item.img || 'icons/svg/mystery-man.svg'
      };

      // Calculate DC and gold cost based on component rarity
      let rarity = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'rarity') || item.system?.rarity || 'Common';
      rarity = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
      const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'];
      const rarityIndex = rarityOrder.indexOf(rarity);
      workshopInterface.workshopDc = rarityIndex >= 0 ? 10 + (rarityIndex * 5) : 10;
      const goldCosts = [50, 200, 2000, 20000, 100000];
      workshopInterface.workshopGoldCost = rarityIndex >= 0 ? goldCosts[rarityIndex] : 50;

      // Query the compendium for a matching recipe
      const { getRecipes } = await import('./workshopCompendium.js');
      const recipes = await getRecipes();
      const matchingRecipe = recipes.find(recipe => recipe.componentType === item.name);

      if (matchingRecipe) {
        // Populate outcome slots
        workshopInterface.workshopOutcomes = matchingRecipe.outcomes || new Array(3).fill(null);
        workshopInterface.workshopOutcomeImgs = matchingRecipe.outcomeImgs || new Array(3).fill(null);
        // Populate tool slots
        workshopInterface.workshopTools = matchingRecipe.toolTypes || new Array(3).fill(null);
        workshopInterface.workshopToolImgs = matchingRecipe.toolImgs || new Array(3).fill(null);
        workshopInterface.workshopToolUuids = matchingRecipe.toolUuids || new Array(3).fill(null);
      } else {
        // No matching recipe found, clear outcomes and tools
        workshopInterface.workshopOutcomes = new Array(3).fill(null);
        workshopInterface.workshopOutcomeImgs = new Array(3).fill(null);
        workshopInterface.workshopTools = new Array(3).fill(null);
        workshopInterface.workshopToolImgs = new Array(3).fill(null);
        workshopInterface.workshopToolUuids = new Array(3).fill(null);
        ui.notifications.info("No recipe found for this component. Outcomes and tools cleared.");
      }

      workshopInterface.selectedOutcomeIndex = null;
      workshopInterface.render();
      await workshopInterface.toggleRuneDrawer();
    });
  });

  // Handle outcome clicking (selection only)
  html.find('.workshop-outcome-box').on('click', async (event) => {
    // Only allow selection if a component is slotted
    if (!workshopInterface.component) {
      ui.notifications.warn("Please slot a component before selecting an outcome.");
      return;
    }

    const index = parseInt(event.currentTarget.dataset.index);
    workshopInterface.selectedOutcomeIndex = index;
    workshopInterface.render();
  });

  // Handle component slot clicking to open the component selector
  html.find('.workshop-component-box').on('click', async (event) => {
    const actor = workshopInterface._actor;
    if (!actor) {
      ui.notifications.error("No actor found to select components.");
      return;
    }

    // Open the component selector application
    const componentSelector = new ComponentSelectorApplication(actor, async (componentData) => {
      // Fetch the actual item using the UUID
      const component = await fromUuid(componentData.uuid);
      if (!component) {
        ui.notifications.error("Failed to load selected component.");
        return;
      }

      // Store the component
      workshopInterface.component = {
        name: componentData.name,
        uuid: componentData.uuid,
        img: componentData.img || 'icons/svg/mystery-man.svg'
      };

      // Calculate DC and gold cost based on component rarity
      let rarity = component.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'rarity') || component.system?.rarity || 'Common';
      rarity = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
      const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'];
      const rarityIndex = rarityOrder.indexOf(rarity);
      workshopInterface.workshopDc = rarityIndex >= 0 ? 10 + (rarityIndex * 5) : 10;
      const goldCosts = [50, 200, 2000, 20000, 100000];
      workshopInterface.workshopGoldCost = rarityIndex >= 0 ? goldCosts[rarityIndex] : 50;

      // Query the compendium for a matching recipe
      const { getRecipes } = await import('./workshopCompendium.js');
      const recipes = await getRecipes();
      const matchingRecipe = recipes.find(recipe => recipe.componentType === componentData.name);

      if (matchingRecipe) {
        // Populate outcome slots
        workshopInterface.workshopOutcomes = matchingRecipe.outcomes || new Array(3).fill(null);
        workshopInterface.workshopOutcomeImgs = matchingRecipe.outcomeImgs || new Array(3).fill(null);
        // Populate tool slots
        workshopInterface.workshopTools = matchingRecipe.toolTypes || new Array(3).fill(null);
        workshopInterface.workshopToolImgs = matchingRecipe.toolImgs || new Array(3).fill(null);
        workshopInterface.workshopToolUuids = matchingRecipe.toolUuids || new Array(3).fill(null);
      } else {
        // No matching recipe found, clear outcomes and tools
        workshopInterface.workshopOutcomes = new Array(3).fill(null);
        workshopInterface.workshopOutcomeImgs = new Array(3).fill(null);
        workshopInterface.workshopTools = new Array(3).fill(null);
        workshopInterface.workshopToolImgs = new Array(3).fill(null);
        workshopInterface.workshopToolUuids = new Array(3).fill(null);
        ui.notifications.info("No recipe found for this component. Outcomes and tools cleared.");
      }

      workshopInterface.selectedOutcomeIndex = null;
      await workshopInterface.render();
      await workshopInterface.toggleRuneDrawer();
    });

    componentSelector.render(true);
  });

  // Handle tool clicking to open item sheet
  html.find('.workshop-tool-link').on('click', async (event) => {
    const itemId = event.currentTarget.dataset.itemId;
    if (itemId) {
      const item = await fromUuid(itemId);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.warn("Tool not found.");
      }
    }
  });

  // Craft button logic
  html.find('.craft-btn').on('click', async () => {
    if (!workshopInterface.component) {
      ui.notifications.warn("Please drop a component to craft.");
      return;
    }

    if (workshopInterface.selectedOutcomeIndex === null) {
      ui.notifications.warn("Please select an outcome to craft.");
      return;
    }

    // Get the actor (assuming the actor is the one who opened the interface)
    const actor = workshopInterface._actor;
    if (!actor) {
      ui.notifications.error("No actor found to perform the crafting.");
      return;
    }

    // Get the required tool for the selected outcome
    const requiredTool = workshopInterface.workshopTools[workshopInterface.selectedOutcomeIndex];
    if (!requiredTool) {
      ui.notifications.warn("No tool specified for this outcome.");
      return;
    }

    // Check if the actor has the required tool in their inventory
    const toolItem = actor.items.find(item => item.name === requiredTool && (item.type === 'tool' || item.system?.type?.value === 'tool'));
    if (!toolItem) {
      ui.notifications.warn(`You need ${requiredTool} in your inventory to craft this item.`);
      return;
    }

    // Roll using the tool with rollToolCheck
    const dc = workshopInterface.workshopDc;
    let roll;
    try {
      roll = await toolItem.rollToolCheck({
        dc: dc,
        rollMode: "publicroll",
        fastForward: false
      });
    } catch (err) {
      console.error("Failed to roll with the tool:", err);
      ui.notifications.error(`Failed to roll with ${requiredTool}: ${err.message}`);
      return;
    }

    if (!roll || !roll[0]) {
      ui.notifications.error("Failed to roll with the tool.");
      return;
    }

    // Get the roll result using roll[0].total
    const rollResult = roll[0].total;
    console.log(`Roll result: ${rollResult}, DC: ${dc}`);

    // Determine the degree of success and prepend the item name
    let prepend = "";
    let priceMultiplier = 1;
    let flavorText = "";
    if (rollResult < dc - 10) {
      prepend = "Patchwork "; // Fail by 10 or more
      priceMultiplier = 0; // Set price to 0 gp
      flavorText = "<p><i>Assembled with little care, this item is a crude amalgamation of errors, its worth diminished to naught in the eyes of any trader.</i></p>";
    } else if (rollResult < dc) {
      prepend = "Shoddy "; // Fail by less than 10
      priceMultiplier = 0.5; // Halve the price
      flavorText = "<p><i>Marred by imperfections, this item bears the marks of a rushed craft, its value lessened in the markets of discerning buyers.</i></p>";
    } else if (rollResult >= dc + 10) {
      prepend = "Masterwork "; // Beat by 10 or more
      priceMultiplier = 2; // Double the price
      flavorText = "<p><i>Forged with masterful precision, this item radiates superior craftsmanship, its value elevated for those who seek the finest wares.</i></p>";
    } else {
      // Success (meet or beat the DC, but less than 10 over)
      flavorText = "<p><i>Crafted with competence, this item meets the expected standards, its value fair for trade and barter.</i></p>";
    }

    // Get the crafted item (outcome)
    const outcome = workshopInterface.workshopOutcomes[workshopInterface.selectedOutcomeIndex];
    if (!outcome) {
      ui.notifications.error("Selected outcome not found.");
      return;
    }

    const craftedItem = await fromUuid(outcome.id);
    if (!craftedItem) {
      ui.notifications.error("Crafted item not found.");
      return;
    }

    // Create the new item data with the prepended name
    const newItemData = craftedItem.toObject();
    newItemData.name = `${prepend}${craftedItem.name}`;

    // Set the base price if not defined (twice the crafting cost)
    const craftingCost = workshopInterface.workshopGoldCost;
    const basePrice = newItemData.system.price?.value || (craftingCost * 2);

    // Adjust the price based on the degree of success
    const adjustedPrice = basePrice * priceMultiplier;
    newItemData.system.price = newItemData.system.price || {};
    newItemData.system.price.value = adjustedPrice;
    newItemData.system.price.denomination = "gp"; // Ensure the denomination is set

    // Append flavor text to the description
    const existingDescription = newItemData.system.description?.value || "";
    newItemData.system.description = newItemData.system.description || {};
    newItemData.system.description.value = existingDescription + flavorText;

    // Check if the item already exists in the actor's inventory (including the prepend)
    const existingItem = actor.items.find(item => item.name === newItemData.name);
    if (existingItem) {
      // If the item exists, increase its quantity by 1
      const newQuantity = (existingItem.system.quantity || 1) + 1;
      await existingItem.update({ "system.quantity": newQuantity });
      ui.notifications.info(`Added 1 ${newItemData.name} to your inventory (total: ${newQuantity}).`);
    } else {
      // If the item doesn't exist, create a new one with quantity 1
      newItemData.system.quantity = 1;
      await actor.createEmbeddedDocuments("Item", [newItemData]);
      ui.notifications.info(`Successfully crafted ${newItemData.name}!`);
    }

    // Deduct gold cost from the actor's currency
    const goldCost = workshopInterface.workshopGoldCost;
    const currentGold = actor.system.currency?.gp || 0;
    if (currentGold < goldCost) {
      ui.notifications.warn("You do not have enough gold to craft this item.");
      // Remove the crafted item if gold deduction fails
      const createdItem = actor.items.find(item => item.name === newItemData.name);
      if (createdItem) {
        await createdItem.delete();
      }
      return;
    }
    await actor.update({ "system.currency.gp": currentGold - goldCost });

    // Reduce the component quantity by 1
    const componentItem = actor.items.find(item => item.uuid === workshopInterface.component.uuid);
    if (componentItem) {
      const currentQuantity = componentItem.system.quantity || 1;
      if (currentQuantity > 1) {
        await componentItem.update({ "system.quantity": currentQuantity - 1 });
      } else {
        await componentItem.delete();
      }
    } else {
      ui.notifications.warn("Component not found in inventory.");
    }

    // Unlock the recipe for the player
    let unlockedRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'unlockedRecipes');
    let userUnlockedRecipes = unlockedRecipes[game.user.id] || [];
    if (!userUnlockedRecipes.includes(workshopInterface.component.name)) {
      userUnlockedRecipes.push(workshopInterface.component.name);
      unlockedRecipes[game.user.id] = userUnlockedRecipes;
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'unlockedRecipes', unlockedRecipes);
      ui.notifications.info(`Recipe for ${workshopInterface.component.name} unlocked!`);
    }

    // Add crafting experience
    await addCraftingExp(actor);

    // Reset the crafting area after crafting
    workshopInterface.component = null;
    workshopInterface.workshopOutcomes = new Array(3).fill(null);
    workshopInterface.workshopTools = new Array(3).fill(null);
    workshopInterface.workshopOutcomeImgs = new Array(3).fill(null);
    workshopInterface.workshopToolImgs = new Array(3).fill(null);
    workshopInterface.workshopToolUuids = new Array(3).fill(null);
    workshopInterface.workshopDc = 10;
    workshopInterface.workshopGoldCost = 50;
    workshopInterface.selectedOutcomeIndex = null;
    workshopInterface.render();
    await workshopInterface.toggleRuneDrawer();
  });

  // Clear the workshop slots
  html.find('.clear-btn').on('click', async () => {
    workshopInterface.component = null;
    workshopInterface.workshopOutcomes = new Array(3).fill(null);
    workshopInterface.workshopTools = new Array(3).fill(null);
    workshopInterface.workshopOutcomeImgs = new Array(3).fill(null);
    workshopInterface.workshopToolImgs = new Array(3).fill(null);
    workshopInterface.workshopToolUuids = new Array(3).fill(null);
    workshopInterface.workshopDc = 10;
    workshopInterface.workshopGoldCost = 50;
    workshopInterface.selectedOutcomeIndex = null;
    workshopInterface.render();
    await workshopInterface.toggleRuneDrawer();
    ui.notifications.info("Workshop slots cleared.");
  });
}
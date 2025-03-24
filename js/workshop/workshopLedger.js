export function handleLedgerListeners(workshopInterface, html) {
  // Handle edit mode toggle (GM only)
  html.find('.toggle-edit-btn').on('click', async () => {
    const { getRecipes } = await import('./workshopCompendium.js');
    if (workshopInterface.editMode) {
      const recipes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes'));
      const recipeId = workshopInterface.selectedRecipeId;
      if (recipeId && recipes[recipeId]) {
        recipes[recipeId].componentType = workshopInterface.editedComponentType || recipes[recipeId].componentType;
        recipes[recipeId].componentUuid = workshopInterface.editedComponentUuid || recipes[recipeId].componentUuid;
        recipes[recipeId].outcomes = workshopInterface.editedOutcomes || recipes[recipeId].outcomes;
        recipes[recipeId].toolTypes = workshopInterface.editedToolTypes || recipes[recipeId].toolTypes;
        recipes[recipeId].toolUuids = workshopInterface.editedToolUuids || recipes[recipeId].toolUuids;
        recipes[recipeId].componentImg = workshopInterface.editedComponentImg !== undefined ? workshopInterface.editedComponentImg : recipes[recipeId].componentImg;
        recipes[recipeId].outcomeImgs = workshopInterface.editedOutcomeImgs || recipes[recipeId].outcomeImgs;
        recipes[recipeId].toolImgs = workshopInterface.editedToolImgs || recipes[recipeId].toolImgs;
        recipes[recipeId].dc = workshopInterface.editedDc !== null ? workshopInterface.editedDc : recipes[recipeId].dc;
        recipes[recipeId].goldCost = workshopInterface.editedGoldCost !== null ? workshopInterface.editedGoldCost : recipes[recipeId].goldCost;

        if (workshopInterface.editedComponentType) {
          recipes[recipeId].name = workshopInterface.editedComponentType;
        }

        try {
          await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', recipes);
          ui.notifications.info("Recipe updated successfully.");
        } catch (error) {
          ui.notifications.error("Failed to save recipe: " + error.message);
        }

        delete workshopInterface.editedComponentType;
        delete workshopInterface.editedComponentUuid;
        delete workshopInterface.editedOutcomes;
        delete workshopInterface.editedToolTypes;
        delete workshopInterface.editedToolUuids;
        delete workshopInterface.editedComponentImg;
        delete workshopInterface.editedOutcomeImgs;
        delete workshopInterface.editedToolImgs;
        delete workshopInterface.editedDc;
        delete workshopInterface.editedGoldCost;
      }
    } else {
      const recipe = (await getRecipes()).find(r => r.id === workshopInterface.selectedRecipeId);
      if (recipe) {
        workshopInterface.editedComponentType = recipe.componentType;
        workshopInterface.editedComponentUuid = recipe.componentUuid;
        workshopInterface.editedOutcomes = foundry.utils.deepClone(recipe.outcomes);
        workshopInterface.editedToolTypes = foundry.utils.deepClone(recipe.toolTypes);
        workshopInterface.editedToolUuids = foundry.utils.deepClone(recipe.toolUuids);
        workshopInterface.editedComponentImg = recipe.componentImg;
        workshopInterface.editedOutcomeImgs = foundry.utils.deepClone(recipe.outcomeImgs);
        workshopInterface.editedToolImgs = foundry.utils.deepClone(recipe.toolImgs);
        workshopInterface.editedDc = recipe.dc;
        workshopInterface.editedGoldCost = recipe.goldCost;
      }
    }
    workshopInterface.editMode = !workshopInterface.editMode;
    workshopInterface.render();
  });

  // Handle drag-and-drop for components, outcomes, and tools
  if (workshopInterface.editMode) {
    html.find('.drop-zone').each((index, element) => {
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

        const type = $element.data('type');
        const index = $element.data('index');

        if (type === 'component') {
          workshopInterface.editedComponentType = item.name;
          workshopInterface.editedComponentUuid = item.uuid;
          workshopInterface.editedComponentImg = item.img || 'icons/svg/mystery-man.svg';

          // Normalize rarity to match rarityOrder (case-insensitive)
          let rarity = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'rarity') || item.system?.rarity || 'Common';
          rarity = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase(); // Normalize to "Common", "Uncommon", etc.
          const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'];
          const rarityIndex = rarityOrder.indexOf(rarity);

          // DC: 10 + 5 per rarity above Common
          workshopInterface.editedDc = rarityIndex >= 0 ? 10 + (rarityIndex * 5) : 10; // Default to 10 if rarity not found
          // Gold Cost: 50, 200, 2000, 20000, 100000
          const goldCosts = [50, 200, 2000, 20000, 100000];
          workshopInterface.editedGoldCost = rarityIndex >= 0 ? goldCosts[rarityIndex] : 50; // Default to 50 if rarity not found
        } else if (type === 'outcome') {
          if (!workshopInterface.editedOutcomes) {
            workshopInterface.editedOutcomes = [];
          }
          if (!workshopInterface.editedToolTypes) {
            workshopInterface.editedToolTypes = [];
          }
          if (!workshopInterface.editedToolUuids) {
            workshopInterface.editedToolUuids = [];
          }
          if (!workshopInterface.editedOutcomeImgs) {
            workshopInterface.editedOutcomeImgs = [];
          }
          if (!workshopInterface.editedToolImgs) {
            workshopInterface.editedToolImgs = [];
          }

          const isTool = item.type === 'tool' || (item.system?.type?.value === 'tool');
          if (isTool) {
            workshopInterface.editedToolTypes[index] = item.name;
            workshopInterface.editedToolUuids[index] = item.uuid;
            workshopInterface.editedToolImgs[index] = item.img;
          } else {
            workshopInterface.editedOutcomes[index] = {
              id: item.uuid,
              name: item.name
            };
            workshopInterface.editedOutcomeImgs[index] = item.img;
            if (!workshopInterface.editedToolTypes[index]) {
              workshopInterface.editedToolTypes[index] = null;
              workshopInterface.editedToolUuids[index] = null;
              workshopInterface.editedToolImgs[index] = null;
            }
          }
        } else if (type === 'tool') {
          const isTool = item.type === 'tool' || (item.system?.type?.value === 'tool');
          if (!isTool) {
            ui.notifications.warn("Only tools can be dropped here.");
            return;
          }
          if (!workshopInterface.editedToolTypes) {
            workshopInterface.editedToolTypes = [];
          }
          if (!workshopInterface.editedToolUuids) {
            workshopInterface.editedToolUuids = [];
          }
          if (!workshopInterface.editedToolImgs) {
            workshopInterface.editedToolImgs = [];
          }
          workshopInterface.editedToolTypes[index] = item.name;
          workshopInterface.editedToolUuids[index] = item.uuid;
          workshopInterface.editedToolImgs[index] = item.img;
        }

        workshopInterface.render();
      });
    });
  }

  // Handle outcome clicking to open item sheet
  html.find('.outcome-link').on('click', async (event) => {
    const itemId = event.currentTarget.dataset.itemId;
    if (itemId) {
      const item = await fromUuid(itemId);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.warn("Item not found.");
      }
    }
  });

  // Handle component clicking to open item sheet
  html.find('.component-link').on('click', async (event) => {
    const itemId = event.currentTarget.dataset.itemId;
    if (itemId) {
      const item = await fromUuid(itemId);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.warn("Component not found.");
      }
    }
  });

  // Handle tool clicking to open item sheet
  html.find('.tool-link').on('click', async (event) => {
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

  // Handle delete button click
  html.find('.delete-recipe-btn').on('click', async (event) => {
    const { getRecipes } = await import('./workshopCompendium.js');
    const recipeId = workshopInterface.selectedRecipeId;
    const recipe = (await getRecipes()).find(r => r.id === recipeId);

    const confirmed = await Dialog.confirm({
      title: "Delete Recipe",
      content: `<p>Are you sure you want to delete the recipe "${recipe.name}"?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      const recipes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes'));
      delete recipes[recipeId];
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', recipes);

      workshopInterface.selectedRecipeId = null;
      workshopInterface.editMode = false;

      workshopInterface.render();
      ui.notifications.info(`Recipe "${recipe.name}" deleted.`);
    }
  });
}
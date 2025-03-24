export function handleCompendiumListeners(workshopInterface, html) {
  html.find('.recipe-tab').on('click', (event) => {
    if (!$(event.target).closest('.delete-tab').length) {
      const recipeId = event.currentTarget.dataset.recipeId;
      workshopInterface.selectedRecipeId = recipeId;
      workshopInterface.editMode = false;
      workshopInterface.render();
    }
  });

  html.find('.new-recipe-btn').on('click', async () => {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can create new recipes.");
      return;
    }

    const recipes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes'));
    const newRecipeId = foundry.utils.randomID();
    recipes[newRecipeId] = {
      id: newRecipeId,
      name: `Recipe ${Object.keys(recipes).length + 1}`,
      componentType: null,
      componentUuid: null,
      outcomes: [],
      toolTypes: [],
      toolUuids: [],
      dc: 10,
      goldCost: 50,
      componentImg: null,
      outcomeImgs: [],
      toolImgs: []
    };

    try {
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', recipes);
      workshopInterface.selectedRecipeId = newRecipeId;
      workshopInterface.editMode = true;
      workshopInterface.render();
      ui.notifications.info("New recipe created. Edit the recipe in the Ledger section.");
    } catch (error) {
      ui.notifications.error("Failed to create new recipe: " + error.message);
      console.error("Error creating new recipe:", error);
    }
  });

  html.find('.delete-tab').on('click', async (event) => {
    event.stopPropagation();
    const recipeId = $(event.currentTarget).closest('.recipe-tab').data('recipe-id');
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

      if (workshopInterface.selectedRecipeId === recipeId) {
        workshopInterface.selectedRecipeId = null;
        workshopInterface.editMode = false;
      }

      workshopInterface.render();
      ui.notifications.info(`Recipe "${recipe.name}" deleted.`);
    }
  });
}

export async function getRecipes() {
  const recipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes');
  return Object.entries(recipes).map(([id, recipe]) => ({
    id,
    name: recipe.name,
    componentType: recipe.componentType,
    componentUuid: recipe.componentUuid,
    outcomes: recipe.outcomes,
    toolTypes: recipe.toolTypes,
    toolUuids: recipe.toolUuids || [],
    dc: recipe.dc,
    goldCost: recipe.goldCost,
    componentImg: recipe.componentImg,
    outcomeImgs: recipe.outcomeImgs,
    toolImgs: recipe.toolImgs
  }));
}
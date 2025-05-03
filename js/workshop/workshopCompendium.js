export function handleCompendiumListeners(workshopInterface, html) {
  if (!(html instanceof HTMLElement)) return;

  html.querySelectorAll('.recipe-tab').forEach(tab => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      const recipeId = event.currentTarget.dataset.recipeId;
      if (recipeId === workshopInterface.selectedRecipeId) return;
      workshopInterface.selectedRecipeId = recipeId;
      workshopInterface.selectedOutcomeIndex = null;
      workshopInterface.render({ force: true });
    });
  });

  html.querySelectorAll('.delete-tab').forEach(deleteButton => {
    deleteButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const recipeTab = event.currentTarget.closest('.recipe-tab');
      const recipeId = recipeTab.dataset.recipeId;
      const recipes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes'));
      const recipe = recipes[recipeId];

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Delete Recipe" },
        content: `<p>Are you sure you want to delete the recipe "${recipe.name}"?</p>`,
        rejectClose: false,
        modal: true
      });

      if (confirmed) {
        delete recipes[recipeId];
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', recipes);

        if (workshopInterface.selectedRecipeId === recipeId) {
          workshopInterface.selectedRecipeId = null;
          workshopInterface.selectedOutcomeIndex = null;
        }

        workshopInterface.render({ force: true });
      }
    });
  });

  html.querySelectorAll('.new-recipe-btn').forEach(newButton => {
    newButton.addEventListener('click', async (event) => {
      event.preventDefault();
      const { RecipeCreationApplication } = await import('./recipeCreationApplication.js');
      new RecipeCreationApplication(workshopInterface).render(true);
    });
  });
}

export async function getRecipes() {
  const recipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes');
  const mappedRecipes = Object.values(recipes).map(recipe => {
    const toolUuids = recipe.toolUuids || new Array(5).fill(null);
    const toolImgs = recipe.toolImgs || new Array(5).fill(null);
    const toolNames = recipe.toolNames || new Array(5).fill(null);
    const tools = toolUuids.map((uuid, idx) => uuid ? { uuid, img: toolImgs[idx], name: toolNames[idx] } : null);

    const toolTypes = recipe.toolTypes || new Array(5).fill(null);
    const normalizedToolTypes = toolTypes.map(type => {
      if (!type || type === 'tool') return null;
      return type === 'calligraphers-su' ? 'calligrapher' : type;
    });

    return {
      id: recipe.id,
      name: recipe.name,
      componentType: recipe.componentType,
      componentUuid: recipe.componentUuid,
      componentImg: recipe.componentImg,
      outcomes: recipe.outcomes || new Array(5).fill(null),
      outcomeNames: recipe.outcomeNames || new Array(5).fill(null),
      toolTypes: normalizedToolTypes,
      toolUuids,
      toolImgs,
      toolNames,
      tools,
      dc: recipe.dc || 10,
      goldCost: recipe.goldCost || 50,
      allowedGroups: recipe.allowedGroups || [],
      isVisible: recipe.isVisible !== undefined ? recipe.isVisible : false
    };
  });

  return mappedRecipes;
}
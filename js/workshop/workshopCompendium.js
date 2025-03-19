// js/workshop/workshopCompendium.js
console.log("workshopCompendium.js loaded");

export class WorkshopCompendium {
  constructor(workshopInterface) {
    this.interface = workshopInterface;
  }

  async getRecipes() {
    async function withTimeout(promise, timeoutMs, errorMessage) {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      });
      return Promise.race([promise, timeout]);
    }

    let workshopRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes') || {};
    console.log("Fetched workshopRecipes from settings:", workshopRecipes);

    if (Object.keys(workshopRecipes).length === 0 && game.user.isGM) {
      workshopRecipes = {
        "recipe1": {
          id: "recipe1",
          componentId: null,
          description: "An incomplete recipe awaiting a component.",
          outcomes: [],
          unlocked: false
        },
        "recipe2": {
          id: "recipe2",
          componentId: "Item.some-uuid-here",
          description: "Forged from the scales of a fallen dragon.",
          outcomes: [
            { uuid: "Item.another-uuid-here", tool: "smithsTools" }
          ],
          unlocked: false
        }
      };
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', workshopRecipes);
      console.log("Initialized placeholder recipes:", workshopRecipes);
      workshopRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes') || {};
      console.log("Re-fetched workshopRecipes after saving:", workshopRecipes);
    }

    const recipes = [];
    for (const recipe of Object.values(workshopRecipes)) {
      let component = null;
      let name = "Incomplete Recipe";
      let componentIcon = "/icons/svg/mystery-man.svg";

      if (recipe.componentId) {
        try {
          component = await withTimeout(
            fromUuid(recipe.componentId),
            5000,
            `Timeout: Failed to fetch component for recipe ${recipe.id}, componentId: ${recipe.componentId}`
          );
          if (component) {
            name = component.name || "Unknown Component";
            componentIcon = component.img || "/icons/svg/mystery-man.svg";
          }
        } catch (err) {
          console.error(`Failed to fetch component for recipe ${recipe.id}:`, err);
        }
      }

      recipes.push({
        id: recipe.id,
        name,
        componentIcon,
        description: recipe.description || "",
        unlocked: game.user.isGM || recipe.unlocked,
        isSelected: recipe.id === this.interface.selectedRecipeId
      });
    }
    console.log("Final recipes list:", recipes);
    return recipes;
  }

  activateListeners(html) {
    // Listener for selecting a recipe
    html.find('.recipe-item').on('click', (event) => {
      const recipeId = $(event.currentTarget).data('recipe-id');
      this.interface.selectedRecipeId = recipeId;
      this.interface.newRecipeMode = false;
      this.interface.render(false);
    });

    // Listener for "Create New Recipe" button
    html.find('.new-recipe-btn').on('click', () => {
      this.interface.newRecipeMode = true;
      this.interface.selectedRecipeId = null;
      this.interface.render(false);
    });
  }
}
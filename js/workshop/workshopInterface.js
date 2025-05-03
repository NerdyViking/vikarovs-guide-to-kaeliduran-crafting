// @ts-nocheck
import { handleCompendiumListeners } from './workshopCompendium.js';
import { handleRecipeBookListeners, handleRecipeBookSlotInteractions, performCrafting, performEnchanting } from './workshopRecipeBook.js';
import { isComponent } from '../shared/utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class WorkshopInterface extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
    this.selectedRecipeId = null;
    this.activeGroup = null;
    this.selectedOutcomeIndex = null;
    this.selectedCharacterId = null;
    this.selectedComponentUuid = null;
    this.lastNotification = null;
    this.dc = null;
    this.goldCostCraft = null;
    this.goldCostEnchant = null;
  }

  static DEFAULT_OPTIONS = {
    id: "workshop-interface",
    classes: ["vikarovs-workshop-interface"],
    window: {
      title: "Vikarov’s Workshop Interface",
      resizable: true,
      minimizable: true,
    },
  };

  static PARTS = {
    main: {
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/workshopInterface.hbs"
    }
  };

  static init() {
    Hooks.once("init", () => {
      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', {
        name: 'Workshop Recipes',
        hint: 'Stores crafting recipes for the workshop system.',
        scope: 'world',
        config: false,
        type: Object,
        default: {}
      });
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const { getRecipes } = await import('./workshopCompendium.js');
    context.isGM = game.user.isGM;
    context.recipes = await getRecipes();

    let actorGroups;
    try {
      actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(this._actor.id);
    } catch (error) {
      console.error(`WorkshopInterface: Error fetching actor groups for ${this._actor.name}:`, error);
      actorGroups = [];
    }

    if (!Array.isArray(actorGroups)) {
      console.warn(`WorkshopInterface: Actor groups is not an array for ${this._actor.name}, defaulting to empty array`);
      actorGroups = [];
    }

    if (game.user.isGM) {
      this.activeGroup = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup') || null;
    } else {
      this.activeGroup = actorGroups.length > 0 ? actorGroups[0].id : null;
    }

    if (!context.isGM) {
      context.recipes = context.recipes.filter(recipe => actorGroups.some(group => recipe.allowedGroups?.includes(group.id)) && recipe.isVisible);
    } else if (this.activeGroup) {
      context.recipes = context.recipes.filter(recipe => recipe.allowedGroups?.includes(this.activeGroup));
    }

    context.selectedRecipe = this.selectedRecipeId
      ? context.recipes.find(recipe => recipe.id === this.selectedRecipeId)
      : null;
    context.selectedOutcomeIndex = this.selectedOutcomeIndex;

    if (context.selectedRecipe) {
      context.selectedRecipe.outcomes = context.selectedRecipe.outcomes.map((outcome, index) => ({
        ...outcome,
        isSelected: index === this.selectedOutcomeIndex
      }));
    }

    context.characters = game.actors.filter(actor => 
      actor.type === 'character' && actor.testUserPermission(game.user, "OWNER")
    );
    
    if (this.selectedCharacterId) {
      const selectedCharacter = game.actors.get(this.selectedCharacterId);
      if (!selectedCharacter || !context.characters.some(actor => actor.id === this.selectedCharacterId)) {
        this.selectedCharacterId = null;
        this.selectedComponentUuid = null;
        this.selectedRecipeId = null;
        this.selectedOutcomeIndex = null;
      }
    }

    if (!this.selectedCharacterId) {
      if (context.isGM) {
        this.selectedCharacterId = null;
      } else {
        const activeCharacter = game.actors.get(game.user.character?.id);
        if (activeCharacter && activeCharacter.testUserPermission(game.user, "OWNER")) {
          this.selectedCharacterId = activeCharacter.id;
        } else {
          this.selectedCharacterId = context.characters.length > 0 ? context.characters[0].id : null;
        }
      }
    }
    context.selectedCharacterId = this.selectedCharacterId;

    context.components = [];
    if (this.selectedCharacterId) {
      const selectedCharacter = game.actors.get(this.selectedCharacterId);
      if (selectedCharacter) {
        await selectedCharacter.getEmbeddedCollection('Item');
        context.components = selectedCharacter.items
          .filter(item => isComponent(item))
          .map(item => ({
            uuid: item.uuid,
            img: item.img || '',
            name: item.name || 'Unknown Item'
          }));
      }
    }
    context.selectedComponentUuid = this.selectedComponentUuid;

    if (game.user.isGM) {
      const activeGroups = game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActiveGroups();
      context.campaigns = activeGroups.reduce((acc, group) => {
        acc[group.id] = { name: group.name };
        return acc;
      }, {});
      context.activeGroup = this.activeGroup;
    }

    context.dc = this.dc;
    context.goldCostCraft = this.goldCostCraft;
    context.goldCostEnchant = this.goldCostEnchant;

    return context;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.isFirstRender) {
      options.window ||= {};
    }
  }

  async _canCraftOrEnchant(context) {
    const reasons = [];

    if (!this.selectedCharacterId) {
      reasons.push("No character selected");
      return { canCraft: false, canEnchant: false, reasons };
    }

    if (!context.selectedRecipe) {
      reasons.push("No recipe selected");
      return { canCraft: false, canEnchant: false, reasons };
    }

    if (this.selectedOutcomeIndex == null) {
      reasons.push("No outcome selected");
      return { canCraft: false, canEnchant: false, reasons };
    }

    const actor = game.actors.get(this.selectedCharacterId);
    if (!actor) {
      reasons.push("Actor not found");
      return { canCraft: false, canEnchant: false, reasons };
    }

    await actor.getEmbeddedCollection('Item');

    let component;
    try {
      component = await fromUuid(context.selectedRecipe.componentUuid);
      if (!component) {
        reasons.push("Component not found");
        return { canCraft: false, canEnchant: false, reasons };
      }
    } catch (err) {
      reasons.push("Error fetching component");
      return { canCraft: false, canEnchant: false, reasons };
    }

    const itemId = context.selectedRecipe.componentUuid.split('.').pop();
    let componentInInventory = actor.items.find(item => item.id === itemId);
    if (!componentInInventory) {
      componentInInventory = actor.items.find(item => item.name === component.name);
    }
    if (!componentInInventory) {
      reasons.push("Component not found in actor's inventory");
      return { canCraft: false, canEnchant: false, reasons };
    }

    const quantity = componentInInventory.system.quantity || 1;
    if (quantity < 1) {
      reasons.push("Insufficient component quantity");
      return { canCraft: false, canEnchant: false, reasons };
    }

    const actorGold = actor.system?.currency?.gp ?? 0;
    const goldCostCraft = component.system.price?.value || 0;
    const goldCostEnchant = goldCostCraft * 1.5;

    const requiredToolType = context.selectedRecipe.toolTypes ? context.selectedRecipe.toolTypes[this.selectedOutcomeIndex] : null;
    const hasTool = !requiredToolType || actor.itemTypes.tool.some(item => {
      const baseItem = item.system?.type?.baseItem;
      const normalizedBaseItem = baseItem?.replace('calligraphers-su', 'calligrapher') || baseItem;
      return normalizedBaseItem === requiredToolType;
    });

    if (!hasTool && requiredToolType) {
      reasons.push(`Required tool type (${requiredToolType}) not in inventory`);
    }

    if (actorGold < goldCostCraft) {
      reasons.push("Not enough gold for crafting");
    }

    if (actorGold < goldCostEnchant) {
      reasons.push("Not enough gold for enchanting");
    }

    return {
      canCraft: hasTool && actorGold >= goldCostCraft,
      canEnchant: actorGold >= goldCostEnchant,
      reasons
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) {
      return;
    }

    if (!this.element.classList.contains('vikarovs-workshop-interface')) {
      this.element.classList.add('vikarovs-workshop-interface');
    }

    handleCompendiumListeners(this, this.element);
    handleRecipeBookListeners(this, this.element);
    handleRecipeBookSlotInteractions(this, this.element);

    const characterSelector = this.element.querySelector('.character-selector');
    if (characterSelector) {
      characterSelector.addEventListener('change', async (event) => {
        this.selectedCharacterId = event.target.value || null;
        this.selectedComponentUuid = null;
        this.selectedRecipeId = null;
        if (this.selectedRecipeId !== context.selectedRecipe?.id) {
          this.selectedOutcomeIndex = null;
        }
        await this.render({ force: true });
      });
    }

    this.element.querySelectorAll('.component-item').forEach(item => {
      item.addEventListener('click', async (event) => {
        event.preventDefault();
        const uuid = item.dataset.uuid;
        const name = item.querySelector('.component-list-name').textContent;
        if (uuid) {
          this.selectedComponentUuid = uuid;
          const { getRecipes } = await import('./workshopCompendium.js');
          const recipes = await getRecipes();
          let recipe = recipes.find(r => r.componentUuid === uuid);
          if (!recipe) {
            recipe = recipes.find(r => r.name.toLowerCase() === name.toLowerCase());
          }
          if (recipe) {
            const recipeChanged = this.selectedRecipeId !== recipe.id;
            this.selectedRecipeId = recipe.id;
            if (recipeChanged) {
              this.selectedOutcomeIndex = null;
            }
            await this.render({ force: true });
          }
        }
      });
    });

    this._canCraftOrEnchant(context).then(({ canCraft, canEnchant, reasons }) => {
      const craftButton = this.element.querySelector('.craft-btn');
      const enchantButton = this.element.querySelector('.enchant-btn');

      if (craftButton) {
        craftButton.disabled = !canCraft;
        if (!canCraft && reasons.length) {
          craftButton.title = `Cannot craft: ${reasons.join(', ')}`;
        } else {
          craftButton.title = 'Craft the selected outcome';
        }
      }

      if (enchantButton) {
        enchantButton.disabled = !canEnchant;
        if (!canEnchant && reasons.length) {
          enchantButton.title = `Cannot enchant: ${reasons.join(', ')}`;
        } else {
          enchantButton.title = 'Enchant the selected outcome';
        }
      }
    }).catch(err => {
      ui.notifications.error('Error checking craft/enchant conditions.');
    });

    const craftButton = this.element.querySelector('.craft-btn');
    if (craftButton) {
      craftButton.addEventListener('click', async (event) => {
        event.preventDefault();
        await performCrafting(this, context);
        await this.render({ force: true });
      });
    }

    const enchantButton = this.element.querySelector('.enchant-btn');
    if (enchantButton) {
      enchantButton.addEventListener('click', async (event) => {
        event.preventDefault();
        await performEnchanting(this, context);
        await this.render({ force: true });
      });
    }

    if (game.user.isGM) {
      const campaignSelector = this.element.querySelector('.campaign-selector');
      if (campaignSelector) {
        campaignSelector.addEventListener('change', async (event) => {
          this.activeGroup = event.target.value || null;
          await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup', this.activeGroup);
          await this.render({ force: true });
        });
      }

      const editButton = this.element.querySelector('.edit-btn');
      if (editButton) {
        editButton.addEventListener('click', async (event) => {
          event.preventDefault();
          const { RecipeCreationApplication } = await import('./recipeCreationApplication.js');
          const recipe = context.selectedRecipe;
          if (recipe) {
            const app = new RecipeCreationApplication(this, {
              recipeId: recipe.id,
              initialData: {
                name: recipe.name,
                component: {
                  uuid: recipe.componentUuid,
                  img: recipe.componentImg,
                  name: recipe.name
                },
                outcomes: recipe.outcomes.map(outcome => outcome ? { uuid: outcome.uuid, img: outcome.img, name: outcome.name || '' } : null),
                tools: recipe.toolUuids.map((uuid, idx) => uuid ? { uuid, img: recipe.toolImgs[idx], name: recipe.toolNames ? recipe.toolNames[idx] : '' } : null),
                dc: recipe.dc,
                goldCost: recipe.goldCost,
                allowedGroups: recipe.allowedGroups,
                hideFromPlayers: !recipe.isVisible
              }
            });
            app.render(true);
          }
        });
      }
    }
  }

  async closeApplication(options = {}) {
    this.selectedRecipeId = null;
    this.selectedOutcomeIndex = null;
    this.activeGroup = null;
    this.selectedCharacterId = null;
    this.selectedComponentUuid = null;
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup');
    return super.closeApplication(options);
  }
}

WorkshopInterface.init();
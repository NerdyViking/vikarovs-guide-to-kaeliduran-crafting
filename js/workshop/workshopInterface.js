export class WorkshopInterface extends FormApplication {
  constructor(actor, options = {}) {
    super({}, options);
    this._actor = actor;
    this.editMode = false;
    this.selectedRecipeId = null;
    this.component = null;
    this.workshopOutcomes = new Array(3).fill(null);
    this.workshopTools = new Array(3).fill(null);
    this.workshopOutcomeImgs = new Array(3).fill(null);
    this.workshopToolImgs = new Array(3).fill(null);
    this.workshopToolUuids = new Array(3).fill(null);
    this.workshopDc = 10;
    this.workshopGoldCost = 50;
    this.selectedOutcomeIndex = null;
    this.editedComponentType = null;
    this.editedComponentUuid = null;
    this.editedOutcomes = null;
    this.editedToolTypes = null;
    this.editedToolUuids = null;
    this.editedComponentImg = null;
    this.editedOutcomeImgs = null;
    this.editedToolImgs = null;
    this.editedDc = null;
    this.editedGoldCost = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "workshop-interface",
      title: "Vikarov’s Workshop Interface",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/workshopInterface.hbs",
      width: 1200,
      height: 800,
      classes: ["vikarovs-workshop-interface"],
      resizable: false
    });
  }

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

      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'unlockedRecipes', {
        name: 'Unlocked Recipes',
        hint: 'Stores which recipes each player has unlocked.',
        scope: 'client',
        config: false,
        type: Object,
        default: {}
      });
    });
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    return buttons;
  }

  activateListeners(html) {
    Promise.all([
      import('./workshopCompendium.js').then(module => module.handleCompendiumListeners),
      import('./workshopLedger.js').then(module => module.handleLedgerListeners),
      import('./workshopWorkshop.js').then(module => module.handleWorkshopListeners)
    ]).then(([handleCompendiumListeners, handleLedgerListeners, handleWorkshopListeners]) => {
      handleCompendiumListeners(this, html);
      handleLedgerListeners(this, html);
      handleWorkshopListeners(this, html);
    });
  }

  async getData() {
    const data = await super.getData();
    const { getRecipes } = await import('./workshopCompendium.js');
    data.isGM = game.user.isGM;
    let recipes = await getRecipes();

    // Get the player's unlocked recipes
    let unlockedRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'unlockedRecipes');
    let userUnlockedRecipes = unlockedRecipes[game.user.id] || [];

    // Filter recipes for non-GM users
    if (!data.isGM) {
      recipes = recipes.filter(recipe => userUnlockedRecipes.includes(recipe.componentType));
    }

    data.recipes = recipes;
    data.selectedRecipe = this.selectedRecipeId
        ? data.recipes.find(recipe => recipe.id === this.selectedRecipeId)
        : null;
    data.component = this.component;
    data.workshopOutcomes = this.workshopOutcomes;
    data.workshopTools = this.workshopTools;
    data.workshopOutcomeImgs = this.workshopOutcomeImgs;
    data.workshopToolImgs = this.workshopToolImgs;
    data.workshopToolUuids = this.workshopToolUuids;
    data.workshopDc = this.workshopDc;
    data.workshopGoldCost = this.workshopGoldCost;
    data.selectedOutcomeIndex = this.selectedOutcomeIndex;
    data.editMode = this.editMode && game.user.isGM;

    // Fetch unidentified descriptions for the outcome items
    data.workshopOutcomeDescriptions = [];
    for (let i = 0; i < 3; i++) {
      const outcome = this.workshopOutcomes[i];
      let description = "";
      if (outcome && outcome.id) {
        try {
          const item = await fromUuid(outcome.id);
          if (item) {
            // Get the unidentified description (corrected path)
            description = item.system?.unidentified?.description || "";
            // If no unidentified description, provide a default based on item type
            if (!description) {
              switch (item.type) {
                case 'weapon':
                  description = "A mysterious weapon, its blade whispering secrets of ancient magic.";
                  break;
                case 'armor':
                  description = "An enigmatic piece of armor, its surface etched with forgotten runes.";
                  break;
                case 'equipment':
                  description = "A curious piece of gear, its true purpose veiled in mystery.";
                  break;
                case 'consumable':
                  description = "A strange concoction, its effects unknown to the untrained eye.";
                  break;
                case 'tool':
                  description = "A curious instrument, its purpose shrouded in mystery, awaiting a skilled hand to reveal its secrets.";
                  break;
                default:
                  description = "An enigmatic item, its true nature hidden from the untrained eye.";
                  break;
              }
            }
            // Strip HTML tags
            description = description.replace(/<[^>]+>/g, '').trim();
          } else {
            description = "An unknown item, its true nature lost to time.";
          }
        } catch (e) {
          console.error("Failed to fetch unidentified description for outcome UUID:", outcome.id, e);
          description = "An unknown item, its true nature lost to time.";
        }
      }
      data.workshopOutcomeDescriptions[i] = description;
    }

    // Check if the component has been crafted before
    data.isFirstCraft = this.component && !userUnlockedRecipes.includes(this.component.name);

    if (data.selectedRecipe) {
      data.selectedRecipe.outcomes = data.selectedRecipe.outcomes || [];
      data.selectedRecipe.toolTypes = data.selectedRecipe.toolTypes || [];
      data.selectedRecipe.toolUuids = data.selectedRecipe.toolUuids || [];
      data.selectedRecipe.outcomeImgs = data.selectedRecipe.outcomeImgs || [];
      data.selectedRecipe.toolImgs = data.selectedRecipe.toolImgs || [];
      data.selectedRecipe.componentType = data.selectedRecipe.componentType || null;
      data.selectedRecipe.componentUuid = data.selectedRecipe.componentUuid || null;
      data.selectedRecipe.componentImg = data.selectedRecipe.componentImg || null;
      data.selectedRecipe.dc = data.selectedRecipe.dc || 10;
      data.selectedRecipe.goldCost = data.selectedRecipe.goldCost || 50;

      if (this.editMode) {
        data.selectedRecipe.componentType = this.editedComponentType !== null ? this.editedComponentType : data.selectedRecipe.componentType;
        data.selectedRecipe.componentUuid = this.editedComponentUuid !== null ? this.editedComponentUuid : data.selectedRecipe.componentUuid;
        data.selectedRecipe.outcomes = this.editedOutcomes || data.selectedRecipe.outcomes;
        data.selectedRecipe.toolTypes = this.editedToolTypes || data.selectedRecipe.toolTypes;
        data.selectedRecipe.toolUuids = this.editedToolTypes || data.selectedRecipe.toolUuids;
        data.selectedRecipe.componentImg = this.editedComponentImg !== undefined ? this.editedComponentImg : data.selectedRecipe.componentImg;
        data.selectedRecipe.outcomeImgs = this.editedOutcomeImgs || data.selectedRecipe.outcomeImgs;
        data.selectedRecipe.toolImgs = this.editedToolImgs || data.selectedRecipe.toolImgs;
        data.selectedRecipe.dc = this.editedDc !== null ? this.editedDc : data.selectedRecipe.dc;
        data.selectedRecipe.goldCost = this.editedGoldCost !== null ? this.editedGoldCost : data.selectedRecipe.goldCost;
      }
    }

    return data;
  }

  close(options = {}) {
    this.selectedRecipeId = null;
    this.editMode = false;
    this.component = null;
    this.workshopOutcomes = new Array(3).fill(null);
    this.workshopTools = new Array(3).fill(null);
    this.workshopOutcomeImgs = new Array(3).fill(null);
    this.workshopToolImgs = new Array(3).fill(null);
    this.workshopToolUuids = new Array(3).fill(null);
    this.workshopDc = 10;
    this.workshopGoldCost = 50;
    this.selectedOutcomeIndex = null;
    this.editedComponentType = null;
    this.editedComponentUuid = null;
    this.editedOutcomes = null;
    this.editedToolTypes = null;
    this.editedToolUuids = null;
    this.editedComponentImg = null;
    this.editedOutcomeImgs = null;
    this.editedToolImgs = null;
    this.editedDc = null;
    this.editedGoldCost = null;
    return super.close(options);
  }
}

WorkshopInterface.init();
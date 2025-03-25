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
    this.runeDrawer = null; // Store the RuneDrawer instance
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

      // Ensure existing actors get the workshopData flag
      Hooks.on("ready", async () => {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second to ensure actors are loaded
        for (const actor of game.actors) {
          if (!actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData")) {
            await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", {
              tier: 1,
              type: "standard",
              exp: 0,
              knownRunes: [],
              runeSwapCharge: true
            });
          }
        }
      });

      // Also set on new actors
      Hooks.on("preCreateActor", (actor) => {
        if (!actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData")) {
          actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData", {
            tier: 1,
            type: "standard",
            exp: 0,
            knownRunes: [],
            runeSwapCharge: true
          });
        }
      });
    });
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    return buttons;
  }

  async toggleRuneDrawer() {
    const workshopData = this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { type: "standard" };
    const isEssenceWorkshop = workshopData.type !== "standard" && !!this.component;

    if (isEssenceWorkshop && !this.runeDrawer) {
      const { RuneDrawer } = await import('./runeDrawer.js');
      this.runeDrawer = new RuneDrawer(this);
      await this.runeDrawer.render(true);
    } else if (!isEssenceWorkshop && this.runeDrawer) {
      await this.runeDrawer.close();
      this.runeDrawer = null;
    }
  }

  activateListeners(html) {
    Promise.all([
      import('./workshopCompendium.js').then(module => module.handleCompendiumListeners),
      import('./workshopLedger.js').then(module => module.handleLedgerListeners),
      import('./workshopWorkshop.js').then(module => module.handleWorkshopListeners),
      import('./workshopUpgradesDialog.js').then(module => module.WorkshopUpgradesDialog)
    ]).then(([handleCompendiumListeners, handleLedgerListeners, handleWorkshopListeners, WorkshopUpgradesDialog]) => {
      handleCompendiumListeners(this, html);
      handleLedgerListeners(this, html);
      handleWorkshopListeners(this, html);

      // Add listener for Upgrades button
      html.find('.upgrades-btn').on('click', () => {
        new WorkshopUpgradesDialog(this._actor).render(true);
      });

      // Listen for updates to the actor's workshopData flag
      Hooks.on("updateActor", (actor, updateData) => {
        if (actor.id === this._actor.id && updateData.flags?.["vikarovs-guide-to-kaeliduran-crafting"]?.workshopData) {
          this.render();
          this.toggleRuneDrawer();
        }
      });

      // Initial toggle of the rune drawer
      this.toggleRuneDrawer();
    });
  }

  async getData() {
    const data = await super.getData();
    const { getRecipes } = await import('./workshopCompendium.js');
    const { capitalize } = await import('../shared/utils.js');
    data.isGM = game.user.isGM;
    let recipes = await getRecipes();

    // Get the player's unlocked recipes
    let unlockedRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'unlockedRecipes');
    let userUnlockedRecipes = unlockedRecipes[game.user.id] || [];

    // Filter recipes for non-GM users
    if (!data.isGM) {
      recipes = recipes.filter(recipe => userUnlockedRecipes.includes(recipe.componentType));
    }

    // Fetch workshop data from actor flags, initialize if missing
    let workshopData = this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'workshopData');
    if (!workshopData) {
      workshopData = {
        tier: 1,
        type: "standard",
        exp: 0,
        knownRunes: [],
        runeSwapCharge: true
      };
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'workshopData', workshopData);
    }
    data.workshopTier = workshopData.tier;
    data.workshopType = workshopData.type;
    data.workshopExp = workshopData.exp;
    data.knownRunes = workshopData.knownRunes;
    data.runeSwapCharge = workshopData.runeSwapCharge;

    // Compute workshop name and subheading data
    data.workshopName = `${capitalize(workshopData.type)} Workshop`;
    data.expNeeded = workshopData.tier * 5; // Exp needed for current tier

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
            description = item.system?.unidentified?.description || "";
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
    if (this.runeDrawer) {
      this.runeDrawer.close();
      this.runeDrawer = null;
    }
    return super.close(options);
  }
}

WorkshopInterface.init();
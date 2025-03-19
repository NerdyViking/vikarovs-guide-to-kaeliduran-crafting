// js/workshop/workshopInterface.js
import { WorkshopCompendium } from './workshopCompendium.js';
import { WorkshopLedger } from './workshopLedger.js';
import { WorkshopWorkshop } from './workshopWorkshop.js';

console.log("workshopInterface.js loaded");

export class VikarovsWorkshopInterface extends Application {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
    this.selectedRecipeId = null;
    this.newRecipeMode = false;
    this.compendium = new WorkshopCompendium(this);
    this.ledger = new WorkshopLedger(this);
    this.workshop = new WorkshopWorkshop(this);
    this.isRendering = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "vikarovs-workshop-interface",
      title: "Vikarov’s Workshop",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/workshopInterface.hbs",
      width: 1200,
      height: 700,
      classes: ["dnd5e2", "sheet", "vikarovs-workshop-interface"],
      resizable: false
    });
  }

  static init() {
    console.log("VikarovsWorkshopInterface: init called");
    Hooks.once("init", () => {
      console.log("VikarovsWorkshopInterface: Registering settings");
      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', {
        name: 'Workshop Recipes',
        hint: 'Stores crafting recipes for the Workshop.',
        scope: 'world',
        config: false,
        type: Object,
        default: {}
      });
    });
  }

  async getData() {
    console.log("getData: Starting data fetch");
    const recipes = await this.compendium.getRecipes();
    const selectedRecipe = recipes.find(r => r.id === this.selectedRecipeId) || null;
    const craftingContent = await this.workshop.getCraftingContent();
    const isGM = game.user.isGM; // Define isGM here
    console.log("getData: isGM value:", isGM); // Verify the value
    const recipeViewerContent = await this.ledger.getRecipeViewerContent(selectedRecipe, this.newRecipeMode, isGM); // Pass isGM
    const data = {
      recipes,
      recipeViewerContent,
      craftingContent,
      newRecipeMode: this.newRecipeMode,
      isGM
    };
    console.log("getData: Data prepared", data);
    return data;
  }

  activateListeners(html) {
    console.log("VikarovsWorkshopInterface: activateListeners called with html", html);
    if (!(html instanceof jQuery)) {
      console.error("VikarovsWorkshopInterface: html is not a jQuery object", html);
      return;
    }

    const closeButton = html.closest('.app').find('.window-header .close');
    if (closeButton.length) {
      closeButton.contents().filter(function() {
        return this.nodeType === Node.TEXT_NODE;
      }).remove();
      console.log("VikarovsWorkshopInterface: Removed 'Close' text from close button");
    } else {
      console.warn("VikarovsWorkshopInterface: Close button not found in DOM");
    }

    this.compendium.activateListeners(html);
    this.ledger.activateListeners(html);
    this.workshop.activateListeners(html);
  }

  async render(force = false, options = {}) {
    if (this.isRendering) {
      console.log("Render: Already rendering, skipping this call");
      return this;
    }
    this.isRendering = true;
    console.log("VikarovsWorkshopInterface: Starting render with force:", force, "options:", options);
    try {
      const rendered = await super.render(force, options);
      console.log("VikarovsWorkshopInterface: Render completed");
      return rendered;
    } finally {
      this.isRendering = false;
    }
  }

  async cleanWorkshopRecipes() {
    console.log("cleanWorkshopRecipes: To be implemented in a later phase");
  }
}

VikarovsWorkshopInterface.init();
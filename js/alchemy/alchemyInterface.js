// js/alchemy/alchemyInterface.js
import { handleCompendiumListeners, prepareCompendiumData } from './alchemyInterfaceCompendium.js';
import { handleCauldronListeners, prepareCauldronData } from './alchemyInterfaceCauldron.js';

export class AlchemyInterface extends Application {
  constructor(actor, options = {}) {
    super(options);
    
    // IMPORTANT: Prevent using with NPCs
    if (actor && actor.type === "npc") {
      ui.notifications.warn("Alchemy Interface can only be used with player characters, not NPCs.");
      return;
    }
    
    this._actor = actor;
    this.editMode = false;
    this.isInitialized = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "alchemy-interface",
      title: "Vikarov's Alchemy Interface",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/alchemyInterface.hbs",
      width: 700,
      height: 925,
      classes: ["alchemy-interface"],
      resizable: false,
      tabs: [{ navSelector: ".interface-tabs", contentSelector: ".sheet-body", initial: "combat" }]
    });
  }

  static init() {
    Hooks.once("init", () => {
      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', {
        name: 'Consumable Outcomes',
        hint: 'Stores crafting outcomes for Combat, Utility, and Entropy.',
        scope: 'world',
        config: false,
        type: Object,
        default: { Combat: {}, Utility: {}, Entropy: {} }
      });
    });
  }

  // Override render to prevent rendering for NPCs
  async render(force = false, options = {}) {
    // Extra safety check - never render for NPCs
    if (this._actor && this._actor.type === "npc") {
      ui.notifications.warn("Alchemy Interface can only be used with player characters, not NPCs.");
      return null;
    }
    
    const rendered = await super.render(force, options);
    return rendered;
  }

  activateListeners(html) {
    // Extra safety check - do nothing for NPCs
    if (!this._actor || this._actor.type === "npc") return;
    
    const tabs = new Tabs(this.options.tabs);
    tabs.bind(html[0]);
    html.find('[data-tab]').on("click", async (event) => {
      const tab = event.currentTarget.dataset.tab;
      try {
        await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab", tab);
      } catch (error) {
        ui.notifications.error("Failed to save last viewed tab.");
      }
    });

    handleCompendiumListeners(this, html);
    handleCauldronListeners(this, html);

    html.find('.reset-crafting-memory-btn').on('click', (event) => this._onResetCraftingMemory(event));

    html.find('.edit-outcomes').on('click', async () => {
      if (game.user.isGM) {
        this.editMode = !this.editMode;
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode', this.editMode);
        this.render(true);
      }
    });
  }

  async _onResetCraftingMemory(event) {
    event.preventDefault();
    if (!this.editMode || !game.user.isGM) return;

    const confirmed = await Dialog.confirm({
      title: "Reset Crafting Memory",
      content: "<p>Are you sure you want to reset the crafting memory? This will mark all outcomes as unknown for players.</p>",
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', {
        Combat: [],
        Utility: [],
        Entropy: []
      });
      this.render(true);
      ui.notifications.info("Crafting memory has been reset.");
    }
  }

  async getData() {
    // Extra safety check - return empty data for NPCs
    if (!this._actor || this._actor.type === "npc") {
      return {};
    }
    
    const data = {};
    const lastTab = await this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab") || "combat";
    this.options.tabs[0].initial = lastTab;

    if (this._actor && !this.isInitialized) {
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', { 0: null, 1: null, 2: null });
      await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      this.isInitialized = true;
    }

    const savedEditMode = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
    if (savedEditMode !== undefined) {
      this.editMode = savedEditMode;
    }

    let craftingMemory = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory');
    if (!craftingMemory) {
      craftingMemory = { Combat: [], Utility: [], Entropy: [] };
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
    }

    const compendiumData = await prepareCompendiumData(this._actor, this.editMode, craftingMemory);
    data.tabs = compendiumData.tabs;
    data.editMode = this.editMode && game.user.isGM;

    const cauldronData = await prepareCauldronData(this._actor);
    data.cauldronSlots = cauldronData.cauldronSlots;
    data.reagentNames = cauldronData.reagentNames;
    data.ipSums = cauldronData.ipSums;
    data.highlight = cauldronData.highlight;
    data.outcomeIcons = cauldronData.outcomeIcons;
    data.allSlotsFilled = cauldronData.allSlotsFilled;

    return data;
  }

  async close(options = {}) {
    if (this._actor && this._actor.type !== "npc") {
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', { 0: null, 1: null, 2: null });
      await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
      this.isInitialized = false;
    }
    this.editMode = false;
    return super.close(options);
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (game.user.isGM) {
      buttons.unshift({
        label: "",
        class: "edit-outcomes",
        icon: "fas fa-edit",
        onclick: async () => {
          this.editMode = !this.editMode;
          await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode', this.editMode);
          this.render(true);
        }
      });
    }
    return buttons;
  }
}

AlchemyInterface.init();
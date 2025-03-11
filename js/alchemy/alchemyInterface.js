// js/alchemy/alchemyInterface.js
console.log("alchemyInterface.js loaded");

import { handleCompendiumListeners, prepareCompendiumData } from './alchemyInterfaceCompendium.js';
import { handleCauldronListeners, prepareCauldronData } from './alchemyInterfaceCauldron.js';

export class AlchemyInterface extends ItemSheet {
  constructor(actor, options = {}) {
    const dummyItemData = { name: "Alchemy Interface", type: "loot", ownership: { default: 2 } };
    const dummyItem = new Item(dummyItemData, { parent: actor });
    super(dummyItem, { actor, ...options });
    this._actor = actor;
    this.editMode = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "alchemy-interface",
      title: "Vikarov’s Alchemy Interface",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/alchemyInterface.hbs",
      width: 700,
      height: 700,
      classes: ["dnd5e2", "sheet", "item", "alchemy-interface"],
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

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    console.log("Getting header buttons. Edit mode:", this.editMode, "Is GM:", game.user.isGM);
    if (game.user.isGM) {
      buttons.unshift({
        label: "",
        class: "edit-outcomes",
        icon: "fas fa-edit",
        onclick: async () => {
          this.editMode = !this.editMode;
          console.log("Toggled edit mode to:", this.editMode);
          await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode', this.editMode);
          this.render(true);
        }
      });
    }
    return buttons.map(button => ({ ...button, label: "" }));
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Handle tab switching
    this._tabs[0].bind(html[0]);
    html.find('[data-tab]').on("click", async (event) => {
      const tab = event.currentTarget.dataset.tab;
      try {
        await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab", tab);
      } catch (error) {
        ui.notifications.error("Failed to save last viewed tab.");
      }
    });

    // Delegate to compendium and cauldron modules
    handleCompendiumListeners(this, html);
    handleCauldronListeners(this, html);

    // Handle reset crafting memory button
    html.find('.reset-crafting-memory-btn').on('click', (event) => this._onResetCraftingMemory(event));
  }

  // Handler for resetting crafting memory with confirmation dialog
  async _onResetCraftingMemory(event) {
    event.preventDefault();
    console.log("Reset crafting memory clicked");
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
    const data = await super.getData();
    const lastTab = await this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab") || "combat";
    this.options.tabs[0].initial = lastTab;

    // Sync editMode with a flag to prevent state loss
    const savedEditMode = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
    if (savedEditMode !== undefined) {
      this.editMode = savedEditMode;
    }

    // Initialize crafting memory if it doesn't exist
    let craftingMemory = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory');
    if (!craftingMemory) {
      craftingMemory = { Combat: [], Utility: [], Entropy: [] };
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
    }

    // Prepare compendium data (outcomes)
    const compendiumData = await prepareCompendiumData(this._actor, this.editMode, craftingMemory);
    data.tabs = compendiumData.tabs;
    data.editMode = this.editMode && game.user.isGM;

    // Prepare cauldron data (slots, names, IP sums)
    const cauldronData = await prepareCauldronData(this._actor);
    data.cauldronSlots = cauldronData.cauldronSlots;
    data.reagentNames = cauldronData.reagentNames;
    data.ipSums = cauldronData.ipSums;
    data.highlight = cauldronData.highlight;
    data.outcomeIcons = cauldronData.outcomeIcons;

    return data;
  }

  close(options = {}) {
    // Clear cauldron slots and edit mode when closing the sheet
    this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
    this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
    this.editMode = false;
    return super.close(options);
  }

  async render(force = false, options = {}) {
    const rendered = await super.render(force, options);

    // Use requestAnimationFrame to ensure the DOM is ready
    const waitForElement = () => new Promise(resolve => {
      const checkElement = () => {
        if (this.element && this.element.length && this.element[0].isConnected) {
          resolve(this.element);
        } else {
          requestAnimationFrame(checkElement);
        }
      };
      requestAnimationFrame(checkElement);
    });

    const $element = await waitForElement();

    // Calculate the required height based on actual content
    const compendiumHeight = $element.find('.compendium')[0]?.scrollHeight || 0;
    const cauldronHeight = $element.find('.cauldron')[0]?.scrollHeight || 0;
    const headerHeight = $element.find('.sheet-header')[0]?.offsetHeight || 0;
    const tabsHeight = $element.find('.interface-tabs')[0]?.offsetHeight || 0;

    // Calculate the actual height needed, minimizing excess space
    const totalHeight = headerHeight + tabsHeight + Math.max(compendiumHeight, cauldronHeight) + 20;

    // Safely set the position
    try {
      this.setPosition({ height: totalHeight });
    } catch (error) {
      console.warn("Failed to set position:", error.message);
    }

    return rendered;
  }
}

AlchemyInterface.init();
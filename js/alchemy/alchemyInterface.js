console.log("alchemyInterface.js loaded");

import { handleCompendiumListeners, prepareCompendiumData } from './alchemyInterfaceCompendium.js';
import { handleCauldronListeners, prepareCauldronData } from './alchemyInterfaceCauldron.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AlchemyInterface extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
    this.editMode = false;
    this.activeGroup = null;
    this.activeTab = "combat";
  }

  static DEFAULT_OPTIONS = {
    id: "alchemy-interface",
    classes: ["alchemy-interface"],
    window: {
      title: "Vikarov’s Alchemy Interface",
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 700,
      height: 700
    }
  };

  static PARTS = {
    main: {
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/alchemyInterface.hbs"
    }
  };

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

      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups', {
        name: 'Crafting Groups',
        hint: 'Stores group definitions for segregating crafting memory across campaigns.',
        scope: 'world',
        config: false,
        type: Object,
        default: {}
      });
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const lastTab = await this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab") || "combat";
    this.activeTab = lastTab;

    const savedEditMode = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
    if (savedEditMode !== undefined) {
      this.editMode = savedEditMode;
    }

    const groupId = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId') || "";
    if (game.user.isGM) {
      this.activeGroup = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup') || null;
    } else {
      this.activeGroup = groupId;
    }

    if (!game.user.isGM && !groupId) {
      ui.notifications.warn("This character is not assigned to a campaign. Please ask the GM to assign it in the Crafting Group Manager.");
    }

    const memoryFlag = groupId ? `craftingMemory.${groupId}` : 'craftingMemory';
    let craftingMemory = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag);
    if (!craftingMemory) {
      craftingMemory = { Combat: [], Utility: [], Entropy: [] };
      await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag, craftingMemory);
    }

    const compendiumData = await prepareCompendiumData(this._actor, this.editMode, craftingMemory);
    const cauldronData = await prepareCauldronData(this._actor);

    context.actor = this._actor;
    context.tabs = compendiumData.tabs;
    context.activeTab = this.activeTab;
    context.editMode = this.editMode && game.user.isGM;
    context.cauldronSlots = cauldronData.cauldronSlots;
    context.reagentNames = cauldronData.reagentNames;
    context.ipSums = cauldronData.ipSums;
    context.highlight = cauldronData.highlight;
    context.outcomeIcons = cauldronData.outcomeIcons;

    if (game.user.isGM) {
      context.groups = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups');
      context.activeGroup = this.activeGroup;
    }

    return context;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.isFirstRender) {
      options.window ||= {};
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) {
      return;
    }

    const html = $(this.element);

    html.find('.interface-tabs .item').removeClass('active');
    html.find(`.interface-tabs .item[data-tab="${this.activeTab}"]`).addClass('active');
    html.find('.sheet-body .tab').removeClass('active');
    html.find(`.sheet-body .tab[data-tab="${this.activeTab}"]`).addClass('active');

    html.find('.interface-tabs .item').on('click', async (event) => {
      event.preventDefault();
      const tab = $(event.currentTarget).data('tab');
      this.activeTab = tab;
      try {
        await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab", tab);
      } catch (error) {
        ui.notifications.error("Failed to save last viewed tab.");
      }
      this.render({ force: true });
    });

    if (game.user.isGM) {
      html.find('.group-selector').on('change', async (event) => {
        this.activeGroup = event.currentTarget.value || null;
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup', this.activeGroup);
        this.render({ force: true });
      });

      html.find('.edit-outcomes').on('click', async () => {
        this.editMode = !this.editMode;
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode', this.editMode);
        this.render({ force: true });
      });
    }

    handleCompendiumListeners(this, html);
    handleCauldronListeners(this, html);

    html.find('.reset-crafting-memory-btn').on('click', (event) => this._onResetCraftingMemory(event));

    const compendiumHeight = html.find('.compendium')[0]?.scrollHeight || 0;
    const cauldronHeight = html.find('.cauldron')[0]?.scrollHeight || 0;
    const tabsHeight = html.find('.interface-tabs')[0]?.offsetHeight || 0;
    const totalHeight = tabsHeight + Math.max(compendiumHeight, cauldronHeight) + 40;

    try {
      this.setPosition({ height: totalHeight });
    } catch (error) {
      console.warn("Failed to set position:", error.message);
    }
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
      this.render({ force: true });
      ui.notifications.info("Crafting memory has been reset.");
    }
  }

  async closeApplication(options = {}) {
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup');
    this.editMode = false;
    this.activeGroup = null;
    this.activeTab = "combat";
    return super.closeApplication(options);
  }
}

AlchemyInterface.init();
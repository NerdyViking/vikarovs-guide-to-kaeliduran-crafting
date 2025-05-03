console.log("alchemyInterface.js loaded");

import { handleCompendiumListeners, prepareCompendiumData, highlightOutcome } from './alchemyInterfaceCompendium.js';
import { prepareCauldronData } from './alchemyInterfaceCauldron.js';
import { performCrafting } from './alchemyCrafting.js';
import { isReagent } from '../shared/utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AlchemyInterface extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
    this.editMode = false;
    this.activeGroup = null;
    this.activeTab = "combat";
    this.isRendering = false;
    this.selectedCharacterId = null; // Track selected character
  }

  static DEFAULT_OPTIONS = {
    id: "alchemy-interface",
    classes: ["alchemy-interface"],
    window: {
      title: "Vikarov’s Alchemy Interface",
      resizable: true,
      minimizable: true
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

    const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(this._actor.id);
    if (game.user.isGM) {
      this.activeGroup = await this._actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup') || null;
    } else {
      this.activeGroup = actorGroups.length > 0 ? actorGroups[0].id : null;
    }

    if (!game.user.isGM && actorGroups.length === 0) {
      ui.notifications.warn("This character is not assigned to any party group. Please ask the GM to add it to a group actor.");
    }

    const groupId = this.activeGroup || actorGroups[0]?.id;
    let craftingMemory = groupId
      ? await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getCraftingMemory(this._actor, groupId)
      : { Combat: [], Utility: [], Entropy: [] };

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

    // Character selection
    context.characters = game.actors.filter(actor => 
      actor.type === 'character' && actor.testUserPermission(game.user, "OWNER")
    );
    
    if (this.selectedCharacterId) {
      const selectedCharacter = game.actors.get(this.selectedCharacterId);
      if (!selectedCharacter || !context.characters.some(actor => actor.id === this.selectedCharacterId)) {
        this.selectedCharacterId = null;
      }
    }

    if (!this.selectedCharacterId) {
      if (game.user.isGM) {
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

    if (game.user.isGM) {
      context.groups = game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActiveGroups().reduce((acc, group) => {
        acc[group.id] = { name: group.name };
        return acc;
      }, {});
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

  async _safeRender(options = {}) {
    if (this.isRendering) return;
    this.isRendering = true;
    try {
      await this.render(options);
    } catch (error) {
      console.error("Render error:", error);
    } finally {
      this.isRendering = false;
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) return;

    const html = $(this.element);
    const actor = this._actor;

    // Update active tab styling
    html.find('.interface-tabs .item').removeClass('active');
    html.find(`.interface-tabs .item[data-tab="${this.activeTab}"]`).addClass('active');
    html.find('.sheet-body .tab').removeClass('active');
    html.find(`.sheet-body .tab[data-tab="${this.activeTab}"]`).addClass('active');

    // Handle tab switching
    html.find('.interface-tabs .item').on('click', async (event) => {
      event.preventDefault();
      const tab = event.currentTarget.dataset.tab;
      this.activeTab = tab;
      try {
        await this._actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab", tab);
      } catch (error) {
        ui.notifications.error("Failed to save last viewed tab.");
      }
      await this._safeRender({ force: true });
    });

    // Handle character selector
    html.find('.character-selector').on('change', async (event) => {
      this.selectedCharacterId = event.currentTarget.value || null;
      await this._safeRender({ force: true });
    });

    // Handle group selector and edit mode toggle for GMs
    if (game.user.isGM) {
      html.find('.group-selector').on('change', async (event) => {
        this.activeGroup = event.currentTarget.value || null;
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup', this.activeGroup);
        await this._safeRender({ force: true });
      });

      html.find('.edit-outcomes').on('click', async () => {
        this.editMode = !this.editMode;
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode', this.editMode);
        await this._safeRender({ force: true });
      });
    }

    // Handle reset crafting memory button
    html.find('.reset-crafting-memory-btn').on('click', (event) => this._onResetCraftingMemory(event));

    // Attach compendium listeners
    handleCompendiumListeners(this, html);

    // Handle cauldron drag-and-drop for reagent slots
    html.find('.reagent-drop-zone').on('dragover', (event) => {
      event.preventDefault();
    });

    html.find('.reagent-drop-zone').on('drop', async (event) => {
      event.preventDefault();
      try {
        const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
        if (data.type !== 'Item') {
          ui.notifications.warn("Only items can be dropped here.");
          return;
        }
        let item = await fromUuid(data.uuid);
        if (!item) {
          item = game.items.get(data.id) || actor.items.get(data.id);
          if (!item) {
            ui.notifications.error("Failed to resolve dropped item.");
            return;
          }
        }

        // Validation 1: Check if the item is a reagent
        if (!isReagent(item)) {
          ui.notifications.warn("Only reagents can be dropped into the cauldron.");
          return;
        }

        // Get the slot index
        const slotIndex = $(event.currentTarget).closest('.reagent-slot').data('slot');

        // Validation 2: Check if the reagent is already used in another slot
        const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
        for (let i = 0; i < 3; i++) {
          if (i.toString() !== slotIndex.toString() && cauldronSlots[i.toString()] === item.id) {
            ui.notifications.warn("Cannot use the same reagent more than once in the cauldron.");
            return;
          }
        }

        // Initialize cauldronSlots if it doesn't exist
        let slots = foundry.utils.deepClone(cauldronSlots);
        slots[slotIndex] = item.id;

        // Store the slot data on the actor
        await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', slots);
        await this._safeRender();

        // Check if this is the third slot being filled
        const filledSlots = Object.values(slots).filter(id => id !== null).length;
        if (filledSlots === 3) {
          const cauldronData = await prepareCauldronData(actor);
          const { ipSums } = cauldronData;
          const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
          // Determine the category with the highest sum
          let category = 'combat';
          if (ipSums.utility === maxSum) {
            category = 'utility';
          } else if (ipSums.entropy === maxSum) {
            category = 'entropy';
          }
          highlightOutcome(category, maxSum, html);
        }
      } catch (error) {
        ui.notifications.error("Failed to drop item: " + error.message);
      }
    });

    // Handle craft button
    html.find('.craft-btn').on('click', async (event) => {
      if (!actor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      // Use the selected character for crafting
      const craftingActor = this.selectedCharacterId ? game.actors.get(this.selectedCharacterId) : actor;
      if (!craftingActor) {
        ui.notifications.error("Selected character not found.");
        return;
      }

      const cauldronData = await prepareCauldronData(actor);
      const { outcomeIcons, ipSums } = cauldronData;

      if (!outcomeIcons || outcomeIcons.length === 0) {
        ui.notifications.warn("No outcome to craft. Please fill all reagent slots.");
        return;
      }

      // Determine the outcome to craft (use selected outcome in tiebreaker, or first outcome if no tiebreaker)
      const selectedOutcome = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      let craftedOutcome;
      if (selectedOutcome) {
        craftedOutcome = outcomeIcons.find(outcome =>
          outcome.category === selectedOutcome.category && outcome.sum === selectedOutcome.sum
        );
      }
      if (!craftedOutcome) {
        craftedOutcome = outcomeIcons[0]; // Default to the first outcome if no selection
      }

      if (!craftedOutcome) {
        ui.notifications.error("Failed to determine the outcome to craft.");
        return;
      }

      // Perform crafting with the selected character
      const cauldronSlots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
      const craftingResult = await performCrafting(craftingActor, cauldronSlots, ipSums, selectedOutcome);

      if (craftingResult.success) {
        // Update crafting memory with the actual crafted category and sum
        const groupId = await actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId');
        if (!groupId) {
          ui.notifications.warn("This character is not assigned to a campaign. Crafting memory will not be saved.");
        } else {
          const memoryFlag = `craftingMemory.${groupId}`;
          const memory = foundry.utils.deepClone(
            actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag) || { Combat: [], Utility: [], Entropy: [] }
          );
          const capitalizedCategory = craftingResult.category.charAt(0).toUpperCase() + craftingResult.category.slice(1);
          if (!memory[capitalizedCategory].includes(craftingResult.sum)) {
            memory[capitalizedCategory].push(craftingResult.sum);
            await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag, memory);
          }
        }

        // Send chat card
        await ChatMessage.create({
          content: craftingResult.message,
          speaker: ChatMessage.getSpeaker({ actor: craftingActor }),
          type: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
      } else {
        ui.notifications.warn(craftingResult.message);
      }

      // Re-render to update inventory
      await this._safeRender();
    });

    // Handle clear button
    html.find('.clear-btn').on('click', async (event) => {
      event.preventDefault();
      if (!actor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      try {
        // Clear the cauldron slots
        const clearedSlots = { 0: null, 1: null, 2: null };
        await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', clearedSlots);

        // Clear the selected outcome
        await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');

        // Re-render the interface to reflect the cleared state
        await this._safeRender();
      } catch (error) {
        console.error("Error clearing cauldron slots:", error);
        ui.notifications.error("Failed to clear cauldron slots: " + error.message);
      }
    });

    // Handle click to open item sheet when slotted
    html.find('.reagent-drop-zone').on('click', (event) => {
      if (!actor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      const $dropZone = $(event.currentTarget);
      const slotIndex = $dropZone.closest('.reagent-slot').data('slot');
      const slots = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
      const itemId = slots[slotIndex];

      if (itemId) {
        const item = game.items.get(itemId) || actor.items.get(itemId);
        if (item) {
          item.sheet.render(true);
        } else {
          ui.notifications.error("Item not found.");
        }
      }
    });

    // Handle click on outcome icon: Shift+Click to open item sheet, regular click to select outcome
    html.find('.outcome-icon').on('click', async (event) => {
      if (!actor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      const $icon = $(event.currentTarget);
      const category = $icon.data('category');
      const sum = $icon.data('sum');
      const itemId = $icon.data('item-id');

      if (event.shiftKey && itemId) {
        // Shift+Click: Open item sheet
        const item = game.items.get(itemId) || actor.items.get(itemId) || (itemId ? fromUuidSync(itemId) : null);
        if (item) {
          item.sheet.render(true);
        } else {
          ui.notifications.error("Item not found.");
        }
      } else {
        // Regular Click: Select outcome
        await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome', { category, sum });
        await this._safeRender();
      }
    });

    // Handle clear outcome buttons in edit mode
    if (this.editMode && game.user.isGM) {
      html.find('.clear-outcome').on('click', async (event) => {
        event.preventDefault();
        const sum = event.currentTarget.dataset.sum;
        const category = event.currentTarget.dataset.category;
        const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
        delete outcomes[category][sum];
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
        await this._safeRender({ force: true });
      });

      // Handle drag-and-drop for outcome cells
      html.find('.outcome-cell').on('dragover', (event) => {
        event.preventDefault();
        event.originalEvent.dataTransfer.dropEffect = 'copy';
      });

      html.find('.outcome-cell').on('drop', async (event) => {
        event.preventDefault();
        try {
          const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
          if (data.type !== 'Item') {
            ui.notifications.warn("Only items can be dropped here.");
            return;
          }
          const item = await fromUuid(data.uuid);
          if (!item) {
            ui.notifications.error("Failed to resolve dropped item.");
            return;
          }
          if (item.type !== 'consumable') {
            ui.notifications.warn("Only consumable items can be assigned as outcomes.");
            return;
          }
          const sum = event.currentTarget.dataset.sum;
          const category = event.currentTarget.dataset.category;
          const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
          outcomes[category][sum] = data.uuid; // Store full UUID
          await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
          await this._safeRender({ force: true });
        } catch (error) {
          ui.notifications.error("Failed to link item to outcome: " + error.message);
        }
      });
    }

    // Adjust window height dynamically
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
      const groupId = this.activeGroup;
      if (groupId) {
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${groupId}`, {
          Combat: [],
          Utility: [],
          Entropy: []
        });
        await this._safeRender({ force: true });
        ui.notifications.info("Crafting memory has been reset.");
      }
    }
  }

  async close(options = {}) {
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
    await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup');
    this.editMode = false;
    this.activeGroup = null;
    this.activeTab = "combat";
    this.isRendering = false;
    this.selectedCharacterId = null;
    return super.close(options);
  }
}

AlchemyInterface.init();
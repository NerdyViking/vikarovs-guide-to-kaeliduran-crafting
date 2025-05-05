import { handleCompendiumListeners, prepareCompendiumData, highlightOutcome } from './alchemyInterfaceCompendium.js';
import { prepareCauldronData } from './alchemyInterfaceCauldron.js';
import { performCrafting } from './alchemyCrafting.js';
import { isReagent } from '../shared/utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Manages the Alchemy Interface application for crafting in Foundry VTT
export class AlchemyInterface extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
    this.editMode = false;
    this.activeGroup = null;
    this.activeTab = "combat";
    this.isRendering = false;
    this.selectedCharacterId = null;
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

  // Initializes settings and socket listeners for the Alchemy Interface
  static init() {
    Hooks.once("init", () => {
      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', {
        name: 'Consumable Outcomes',
        hint: 'Stores crafting outcomes for Combat, Utility, and Entropy.',
        scope: 'world',
        config: false,
        type: Object,
        default: { Combat: {}, Utility: {}, Entropy: [] }
      });

      game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', {
        name: 'Crafting Memory',
        hint: 'Stores crafting memory per campaign.',
        scope: 'world',
        config: false,
        type: Object,
        default: {}
      });
    });

    Hooks.once("ready", () => {
      game.socket.on('module.vikarovs-guide-to-kaeliduran-crafting', async (data) => {
        if (!game.user.isGM) return;

        if (data.operation === "updateCraftingMemory") {
          const { groupId, category, sum } = data.payload;
          const craftingMemory = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {});
          if (!craftingMemory[groupId]) {
            craftingMemory[groupId] = { Combat: [], Utility: [], Entropy: [] };
          }
          const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
          if (!craftingMemory[groupId][capitalizedCategory].includes(sum)) {
            craftingMemory[groupId][capitalizedCategory].push(sum);
            await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
          }
        }

        else if (data.operation === "resetCraftingMemory") {
          const { groupId } = data.payload;
          const craftingMemory = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {});
          craftingMemory[groupId] = { Combat: [], Utility: [], Entropy: [] };
          await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
        }

        else if (data.operation === "resetOutcomeMemory") {
          const { groupId, category, sum } = data.payload;
          const craftingMemory = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {});
          if (craftingMemory[groupId] && craftingMemory[groupId][category]) {
            craftingMemory[groupId][category] = craftingMemory[groupId][category].filter(s => s !== sum);
            await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
          }
        }

        else if (data.operation === "updateItemPermissions") {
          const { itemUuid, ownershipUpdates } = data.payload;
          const item = await fromUuid(itemUuid);
          if (item) {
            await item.update({ ownership: ownershipUpdates });
          }
        }
      });
    });
  }

  // Prepares the context data for rendering the Alchemy Interface template
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
      ? await this._getCraftingMemory(groupId)
      : { Combat: [], Utility: [], Entropy: [] };

    const compendiumData = await prepareCompendiumData(this._actor, this.editMode, craftingMemory);
    const craftingActor = this.selectedCharacterId ? game.actors.get(this.selectedCharacterId) : this._actor;
    const cauldronData = await prepareCauldronData(craftingActor);

    context.actor = this._actor;
    context.tabs = compendiumData.tabs;
    context.activeTab = this.activeTab;
    context.editMode = this.editMode && game.user.isGM;
    context.slots = cauldronData.slots;
    context.ipSums = cauldronData.ipSums;
    context.highlight = cauldronData.highlight;
    context.outcomeIcons = cauldronData.outcomeIcons;
    context.goldCost = cauldronData.goldCost;
    context.baseQuantity = cauldronData.baseQuantity;
    context.quantityBreakdown = cauldronData.quantityBreakdown;

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

    context.reagents = [];
    if (this.selectedCharacterId) {
      const selectedCharacter = game.actors.get(this.selectedCharacterId);
      if (selectedCharacter) {
        await selectedCharacter.getEmbeddedCollection('Item');
        const cauldronSlots = craftingActor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
        const slottedUuids = Object.values(cauldronSlots).filter(uuid => uuid);
        context.reagents = selectedCharacter.items
          .filter(item => isReagent(item) && !slottedUuids.includes(item.uuid))
          .map(item => ({
            uuid: item.uuid,
            name: item.name || 'Unknown Reagent',
            img: item.img || '',
            ipValues: item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 }
          }));
      }
    }

    if (game.user.isGM) {
      const activeGroups = game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActiveGroups();
      context.groups = Array.isArray(activeGroups) ? activeGroups.reduce((acc, group) => {
        acc[group.id] = { name: group.name };
        return acc;
      }, {}) : {};
      context.activeGroup = this.activeGroup;
    }

    return context;
  }

  // Retrieves the crafting memory for a specific group, initializing if necessary
  async _getCraftingMemory(groupId) {
    const craftingMemory = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {};
    if (!craftingMemory[groupId]) {
      craftingMemory[groupId] = { Combat: [], Utility: [], Entropy: [] };
      if (game.user.isGM) {
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
      } else {
        await game.socket.emit('module.vikarovs-guide-to-kaeliduran-crafting', {
          operation: "updateCraftingMemory",
          payload: { groupId, category: "Combat", sum: 0 }
        });
      }
    }
    return craftingMemory[groupId];
  }

  // Updates the crafting memory by adding a new outcome for a group
  async _setCraftingMemory(groupId, category, sum) {
    if (game.user.isGM) {
      const craftingMemory = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {});
      if (!craftingMemory[groupId]) {
        craftingMemory[groupId] = { Combat: [], Utility: [], Entropy: [] };
      }
      const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
      if (!craftingMemory[groupId][capitalizedCategory].includes(sum)) {
        craftingMemory[groupId][capitalizedCategory].push(sum);
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
      }
    } else {
      await game.socket.emit('module.vikarovs-guide-to-kaeliduran-crafting', {
        operation: "updateCraftingMemory",
        payload: { groupId, category, sum }
      });
    }
  }

  // Resets the crafting memory for a specific group
  async _resetCraftingMemory(groupId) {
    if (game.user.isGM) {
      const craftingMemory = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {});
      craftingMemory[groupId] = { Combat: [], Utility: [], Entropy: [] };
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
    } else {
      await game.socket.emit('module.vikarovs-guide-to-kaeliduran-crafting', {
        operation: "resetCraftingMemory",
        payload: { groupId }
      });
    }
  }

  // Resets a specific outcome in the crafting memory for a group
  async _resetOutcomeMemory(groupId, category, sum) {
    if (game.user.isGM) {
      const craftingMemory = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory') || {});
      if (craftingMemory[groupId] && craftingMemory[groupId][category]) {
        craftingMemory[groupId][category] = craftingMemory[groupId][category].filter(s => s !== sum);
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingMemory', craftingMemory);
      }
    } else {
      await game.socket.emit('module.vikarovs-guide-to-kaeliduran-crafting', {
        operation: "resetOutcomeMemory",
        payload: { groupId, category, sum }
      });
    }
  }

  // Renders the sheet for a given item
  async _renderItemSheet(item) {
    try {
      await item.sheet.render(true);
    } catch (error) {
      console.error("Error rendering item sheet:", error);
      ui.notifications.error("Failed to open item sheet: " + error.message);
    }
  }

  // Configures rendering options for the application
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.isFirstRender) {
      options.window ||= {};
    }
  }

  // Safely renders the application, preventing concurrent renders
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

  // Handles rendering logic and sets up event listeners for the interface
  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) return;

    const html = $(this.element);
    const actor = this._actor;
    const craftingActor = this.selectedCharacterId ? game.actors.get(this.selectedCharacterId) : actor;

    html.find('.interface-tabs .item').removeClass('active');
    html.find(`.interface-tabs .item[data-tab="${this.activeTab}"]`).addClass('active');
    html.find('.tab').removeClass('active');
    html.find(`.tab[data-tab="${this.activeTab}"]`).addClass('active');

    html.find('.interface-tabs .item').on('click', async (event) => {
      event.preventDefault();
      const tab = event.currentTarget.dataset.tab;
      this.activeTab = tab;
      try {
        await actor.setFlag("vikarovs-guide-to-kaeliduran-crafting", "lastAlchemyInterfaceTab", tab);
      } catch (error) {
        ui.notifications.error("Failed to save last viewed tab.");
      }
      await this._safeRender({ force: true });
    });

    html.find('.character-selector').on('change', async (event) => {
      this.selectedCharacterId = event.currentTarget.value || null;
      await this._safeRender({ force: true });
    });

    if (game.user.isGM) {
      html.find('.group-selector').on('change', async (event) => {
        this.activeGroup = event.currentTarget.value || null;
        await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup', this.activeGroup);
        await this._safeRender({ force: true });
      });

      html.find('.edit-outcomes').on('click', async () => {
        this.editMode = !this.editMode;
        await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode', this.editMode);
        await this._safeRender({ force: true });
      });
    }

    html.find('.reset-crafting-memory-btn').on('click', (event) => this._onResetCraftingMemory(event));
    html.find('.reset-outcome-memory-btn').on('click', (event) => this._onResetOutcomeMemory(event));

    handleCompendiumListeners(this, html);

    html.find('.reagent-drop-zone').on('dragover', (event) => {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    html.find('.reagent-drop-zone').on('drop', async (event) => {
      event.preventDefault();
      try {
        const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
        if (data.type !== 'Item' || !data.uuid) {
          ui.notifications.warn("Only items can be dropped here.");
          return;
        }

        const item = await fromUuid(data.uuid);
        if (!item) {
          console.error(`Failed to resolve item with UUID: ${data.uuid}`);
          ui.notifications.error("Failed to resolve dropped item.");
          return;
        }

        if (!isReagent(item)) {
          ui.notifications.warn("Only reagents can be dropped into the cauldron.");
          return;
        }

        const slotIndex = $(event.currentTarget).closest('.reagent-slot').data('slot');
        const cauldronSlots = craftingActor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
        for (let i = 0; i < 3; i++) {
          if (i.toString() !== slotIndex.toString() && cauldronSlots[i.toString()] === data.uuid) {
            ui.notifications.warn("Cannot use the same reagent more than once in the cauldron.");
            return;
          }
        }

        let slots = foundry.utils.deepClone(cauldronSlots);
        slots[slotIndex.toString()] = data.uuid;
        await craftingActor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', slots);
        await this._safeRender({ force: true });

        const filledSlots = Object.values(slots).filter(uuid => uuid).length;
        if (filledSlots === 3) {
          const cauldronData = await prepareCauldronData(craftingActor);
          const { ipSums } = cauldronData;
          const maxSum = Math.max(ipSums.combat, ipSums.utility, ipSums.entropy);
          let category = 'combat';
          if (ipSums.utility === maxSum) {
            category = 'utility';
          } else if (ipSums.entropy === maxSum) {
            category = 'entropy';
          }
          highlightOutcome(category, maxSum, html);
        }
      } catch (error) {
        console.error("Drop error:", error);
        ui.notifications.error("Failed to drop item: " + error.message);
      }
    });

    html.find('.reagent-item').on('dragstart', (event) => {
      const uuid = event.currentTarget.dataset.uuid;
      if (uuid) {
        event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid }));
      }
    });

    html.find('.reagent-item').on('click', async (event) => {
      const uuid = event.currentTarget.dataset.uuid;
      if (uuid) {
        const item = await fromUuid(uuid);
        if (item) {
          await this._renderItemSheet(item);
        } else {
          ui.notifications.error("Item not found.");
        }
      }
    });

    html.find('.craft-btn').on('click', async (event) => {
      event.preventDefault();

      const craftingActor = this.selectedCharacterId ? game.actors.get(this.selectedCharacterId) : actor;
      if (!craftingActor) {
        ui.notifications.error("No actor selected for crafting. Please select a character.");
        return;
      }

      try {
        const cauldronData = await prepareCauldronData(craftingActor);
        const { outcomeIcons, ipSums } = cauldronData;

        if (!outcomeIcons || outcomeIcons.length === 0) {
          ui.notifications.warn("No outcome to craft. Please fill all reagent slots and select an outcome.");
          return;
        }

        const cauldronSlots = craftingActor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots');
        if (!cauldronSlots || Object.values(cauldronSlots).filter(uuid => uuid).length !== 3) {
          ui.notifications.warn("Please fill all three cauldron slots with reagents.");
          return;
        }

        const selectedOutcome = craftingActor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
        let craftedOutcome = null;
        if (selectedOutcome) {
          craftedOutcome = outcomeIcons.find(outcome =>
            outcome.category === selectedOutcome.category && outcome.sum === selectedOutcome.sum
          );
        }
        if (!craftedOutcome) {
          craftedOutcome = outcomeIcons[0];
        }

        if (!craftedOutcome) {
          ui.notifications.error("Failed to determine the outcome to craft.");
          return;
        }

        const craftingResult = await performCrafting(craftingActor, cauldronSlots, ipSums, selectedOutcome);
        if (craftingResult.success) {
          const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(craftingActor.id);
          const group = actorGroups.length > 0 ? actorGroups[0] : null;
          if (group) {
            const groupId = group.id;
            await this._setCraftingMemory(groupId, craftingResult.category, craftingResult.sum);
          } else {
            ui.notifications.warn("This character is not assigned to a campaign. Crafting memory will not be saved.");
          }

          const clearedSlots = { 0: null, 1: null, 2: null };
          await craftingActor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', clearedSlots);
          await craftingActor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');

          await this._safeRender({ force: true });
        } else {
          ui.notifications.warn(craftingResult.message);
        }
      } catch (error) {
        console.error("Crafting error:", error);
        ui.notifications.error("An error occurred during crafting: " + error.message);
      }
    });

    html.find('.clear-btn').on('click', async (event) => {
      event.preventDefault();
      if (!craftingActor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      try {
        const clearedSlots = { 0: null, 1: null, 2: null };
        await craftingActor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', clearedSlots);
        await craftingActor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
        await this._safeRender({ force: true });
      } catch (error) {
        console.error("Clear error:", error);
        ui.notifications.error("Failed to clear cauldron slots: " + error.message);
      }
    });

    html.find('.reagent-drop-zone').on('click', async (event) => {
      if (!craftingActor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      const $dropZone = $(event.currentTarget);
      const slotIndex = $dropZone.closest('.reagent-slot').data('slot');
      const slots = craftingActor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots') || { 0: null, 1: null, 2: null };
      const itemUuid = slots[slotIndex.toString()];

      if (itemUuid) {
        const item = await fromUuid(itemUuid);
        if (item) {
          await this._renderItemSheet(item);
        } else {
          ui.notifications.error("Item not found.");
        }
      }
    });

    html.find('.outcome-icon').on('click', async (event) => {
      if (!craftingActor) {
        ui.notifications.error("No actor selected. Please select a token or provide an actor context.");
        return;
      }

      const $icon = $(event.currentTarget);
      const category = $icon.data('category');
      const sum = $icon.data('sum');
      const itemId = $icon.data('item-id');
      const hasItem = $icon.hasClass('has-item');

      if (event.shiftKey && itemId && hasItem) {
        const item = await fromUuid(itemId);
        if (item) {
          await this._renderItemSheet(item);
        } else {
          ui.notifications.error("Item not found.");
        }
      } else if (hasItem) {
        await craftingActor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome', { category, sum });
        await this._safeRender({ force: true });
      }
    });

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
          if (!outcomes[category]) outcomes[category] = {};
          outcomes[category][sum] = data.uuid;
          await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
          await this._safeRender({ force: true });
        } catch (error) {
          ui.notifications.error("Failed to link item to outcome: " + error.message);
        }
      });
    }

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

  // Prompts the GM to reset the crafting memory for a selected campaign group
  async _onResetCraftingMemory(event) {
    event.preventDefault();
    if (!this.editMode || !game.user.isGM) return;

    const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(this._actor.id);
    if (actorGroups.length === 0) {
      ui.notifications.warn("This actor is not part of any campaigns.");
      return;
    }

    const dialogContent = `
      <p>Select the campaign to reset crafting memory for:</p>
      <form>
        <div class="form-group">
          <label for="groupId">Campaign:</label>
          <select name="groupId" id="groupId">
            {{#each groups as |group groupId|}}
              <option value="{{groupId}}">{{group.name}}</option>
            {{/each}}
          </select>
        </div>
      </form>
    `;

    const confirmed = await Dialog.confirm({
      title: "Reset Crafting Memory",
      content: dialogContent,
      yes: html => {
        const groupId = html.find('#groupId').val();
        if (!groupId) {
          ui.notifications.error("Please select a campaign.");
          return false;
        }
        return groupId;
      },
      no: () => false,
      defaultYes: false,
      render: (html) => {
        const groups = actorGroups.reduce((acc, group) => {
          acc[group.id] = { name: group.name };
          return acc;
        }, {});
        const select = html.find('#groupId');
        select.empty();
        select.append('<option value="">Select Campaign</option>');
        Object.entries(groups).forEach(([groupId, group]) => {
          select.append(`<option value="${groupId}">${group.name}</option>`);
        });
      }
    });

    if (confirmed) {
      const groupId = confirmed;
      await this._resetCraftingMemory(groupId);
      await this._safeRender({ force: true });
      ui.notifications.info("Crafting memory has been reset.");
    }
  }

  // Prompts the GM to reset a specific outcome in the crafting memory for a group
  async _onResetOutcomeMemory(event) {
    event.preventDefault();
    if (!this.editMode || !game.user.isGM) return;

    const actorGroups = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActorGroups(this._actor.id);
    if (actorGroups.length === 0) {
      ui.notifications.warn("This actor is not part of any campaigns.");
      return;
    }

    const dialogContent = `
      <p>Select the campaign and outcome to reset crafting memory for:</p>
      <form>
        <div class="form-group">
          <label for="groupId">Campaign:</label>
          <select name="groupId" id="groupId" required>
            <option value="">Select Campaign</option>
            {{#each groups as |group groupId|}}
              <option value="{{groupId}}">{{group.name}}</option>
            {{/each}}
          </select>
        </div>
        <div class="form-group">
          <label for="category">Category:</label>
          <select name="category" id="category" required>
            <option value="Combat">Combat</option>
            <option value="Utility">Utility</option>
            <option value="Entropy">Entropy</option>
          </select>
        </div>
        <div class="form-group">
          <label for="sum">Sum:</label>
          <input type="number" name="sum" id="sum" min="1" required>
        </div>
      </form>
    `;

    const confirmed = await Dialog.confirm({
      title: "Reset Outcome Crafting Memory",
      content: dialogContent,
      yes: html => {
        const groupId = html.find('#groupId').val();
        const category = html.find('#category').val();
        const sum = parseInt(html.find('#sum').val());
        if (!groupId || !category || isNaN(sum) || sum < 1) {
          ui.notifications.error("Please select a valid campaign, category, and sum.");
          return false;
        }
        return { groupId, category, sum };
      },
      no: () => false,
      defaultYes: false,
      render: (html) => {
        const groups = actorGroups.reduce((acc, group) => {
          acc[group.id] = { name: group.name };
          return acc;
        }, {});
        const select = html.find('#groupId');
        select.empty();
        select.append('<option value="">Select Campaign</option>');
        Object.entries(groups).forEach(([groupId, group]) => {
          select.append(`<option value="${groupId}">${group.name}</option>`);
        });
      }
    });

    if (confirmed) {
      const { groupId, category, sum } = confirmed;
      await this._resetOutcomeMemory(groupId, category, sum);
      ui.notifications.info(`Crafting memory for ${category} ${sum} in campaign has been reset.`);
      await this._safeRender({ force: true });
    }
  }

  // Closes the interface and clears cauldron state
  async close(options = {}) {
    try {
      const clearedSlots = { 0: null, 1: null, 2: null };
      const craftingActor = this.selectedCharacterId ? game.actors.get(this.selectedCharacterId) : this._actor;
      await craftingActor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', clearedSlots);
      await craftingActor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'selectedOutcome');
      await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'editMode');
      await this._actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'activeGroup');
    } catch (error) {
      console.error("Error clearing cauldron state on close:", error);
    }

    this.editMode = false;
    this.activeGroup = null;
    this.activeTab = "combat";
    this.isRendering = false;
    this.selectedCharacterId = null;
    return super.close(options);
  }
}

AlchemyInterface.init();
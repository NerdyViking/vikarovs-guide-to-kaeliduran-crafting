import { capitalize } from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A dialog for configuring items in the Kaeliduran Crafting system.
 * Allows users to set an item as a component or reagent, configure its essence,
 * and set Influence Point (IP) values for combat, utility, and entropy.
 */
export class ItemConfigurationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Constructor for the ItemConfigurationDialog.
   * Initializes the dialog with default data and binds event handlers.
   * @param {Object} options - Options for the dialog, passed to the parent constructor.
   */
  constructor(options = {}) {
    super(options);
    this.itemData = null; // Holds the currently loaded item's data (uuid, img, name)
    this.formData = {
      type: 'none', // Item type: 'none', 'component', or 'reagent'
      essence: 'None', // Essence type: 'None', 'Primal', 'Fey', 'Eldritch'
      ipValues: { combat: 0, utility: 0, entropy: 0 } // IP values for the item
    };
    this._handleDrop = this._handleDrop.bind(this);
    this._handleSave = this._handleSave.bind(this);
    this._handleClear = this._handleClear.bind(this);
    this._handleCancel = this._handleCancel.bind(this);
    this._handleTypeChange = this._handleTypeChange.bind(this);
  }

  /**
   * Default options for the dialog, defining its ID, classes, window properties, and position.
   */
  static DEFAULT_OPTIONS = {
    id: "item-configuration-dialog",
    classes: ["vikarovs-item-configuration"],
    window: {
      title: "Item Configuration",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 400,
      height: "auto"
    }
  };

  /**
   * Defines the template parts for the dialog, specifying the Handlebars template to use.
   */
  static PARTS = {
    main: {
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/itemConfigurationDialog.hbs"
    }
  };

  /**
   * Prepares the context for rendering the dialog.
   * Adds itemData and formData to the context for use in the template.
   * @param {Object} options - Rendering options.
   * @returns {Object} The context object for rendering.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.itemData = this.itemData;
    context.formData = this.formData;
    return context;
  }

  /**
   * Sets up event listeners for the dialog after rendering.
   * Handles drag-and-drop, form changes, and button clicks.
   * @param {Object} context - The rendering context.
   * @param {Object} options - Rendering options.
   */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) return;

    const form = this.element.querySelector('form');
    if (!form) return;

    const dropZone = form.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.addEventListener('drop', this._handleDrop);
      dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      });
    }

    const typeSelect = form.querySelector('select[name="type"]');
    if (typeSelect) {
      typeSelect.addEventListener('change', this._handleTypeChange);
    }

    const saveButton = form.querySelector('.save-btn');
    if (saveButton) {
      saveButton.addEventListener('click', this._handleSave);
    }

    const clearButton = form.querySelector('.clear-btn');
    if (clearButton) {
      clearButton.addEventListener('click', this._handleClear);
    }

    const cancelButton = form.querySelector('.cancel-btn');
    if (cancelButton) {
      cancelButton.addEventListener('click', this._handleCancel);
    }
  }

  /**
   * Handles the drop event when an item is dropped into the dialog.
   * Validates the item, loads its data, and parses existing flags.
   * @param {Event} event - The drop event.
   */
  async _handleDrop(event) {
    event.preventDefault();
    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));
      if (!data.type || !data.uuid) {
        ui.notifications.warn("Invalid item data.");
        return;
      }

      const item = await fromUuid(data.uuid);
      if (!item) {
        ui.notifications.warn("Item not found.");
        return;
      }

      if (item.type !== 'loot') {
        ui.notifications.warn("Only loot items can be configured.");
        return;
      }

      this.itemData = {
        uuid: data.uuid,
        img: item.img || '',
        name: item.name || 'Unknown Item'
      };

      const parsedFlags = await this._parseItemFlags(item);
      if (!parsedFlags) {
        ui.notifications.warn("Failed to parse existing item flags.");
        this.formData = {
          type: 'none',
          essence: 'None',
          ipValues: { combat: 0, utility: 0, entropy: 0 }
        };
      } else {
        this.formData = parsedFlags;
      }

      await this.render({ force: true });
      ui.notifications.info(`Loaded ${item.name} for configuration.`);
    } catch (error) {
      ui.notifications.error(`Failed to load item: ${error.message}`);
    }
  }

  /**
   * Parses the flags of an item to populate the form data.
   * Extracts type, essence, and IP values from the item's flags.
   * @param {Object} item - The item to parse flags from.
   * @returns {Object|null} The parsed form data or null if parsing fails.
   */
  async _parseItemFlags(item) {
    try {
      const isComponent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent');
      const isReagent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent');
      const essence = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'essence') || 'None';
      const ipValues = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };

      return {
        type: isComponent ? 'component' : isReagent ? 'reagent' : 'none',
        essence: essence ? String(essence).trim() : 'None',
        ipValues: {
          combat: parseInt(ipValues.combat) || 0,
          utility: parseInt(ipValues.utility) || 0,
          entropy: parseInt(ipValues.entropy) || 0
        }
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Handles changes to the item type select dropdown.
   * Updates the formData and re-renders the dialog.
   * @param {Event} event - The change event.
   */
  async _handleTypeChange(event) {
    this.formData.type = event.target.value;
    await this.render({ force: true });
  }

  /**
   * Handles the save button click.
   * Validates form data, updates the item's flags, verifies the update, and clears the slot.
   * Keeps the dialog open after saving.
   * @param {Event} event - The click event.
   */
  async _handleSave(event) {
    event.preventDefault();
    if (!this.itemData) {
      ui.notifications.error("No item selected.");
      return;
    }

    const item = await fromUuid(this.itemData.uuid);
    if (!item) {
      ui.notifications.error("Item not found.");
      return;
    }

    try {
      const initialFlags = await this._parseItemFlags(item);
      if (!initialFlags) {
        ui.notifications.error("Failed to parse initial item flags.");
        return;
      }

      const form = this.element.querySelector('form');
      const formData = new FormData(form);

      const typeSelect = form.querySelector('select[name="type"]');
      const essenceSelect = form.querySelector('select[name="essence"]');
      const combatInput = form.querySelector('input[name="ipValues.combat"]');
      const utilityInput = form.querySelector('input[name="ipValues.utility"]');
      const entropyInput = form.querySelector('input[name="ipValues.entropy"]');

      const newFlags = {
        type: formData.get('type') || typeSelect?.value || 'none',
        essence: formData.get('essence') ? String(formData.get('essence')).trim() : (essenceSelect?.value || 'None'),
        ipValues: {
          combat: parseInt(formData.get('ipValues.combat') || combatInput?.value) || 0,
          utility: parseInt(formData.get('ipValues.utility') || utilityInput?.value) || 0,
          entropy: parseInt(formData.get('ipValues.entropy') || entropyInput?.value) || 0
        }
      };

      if (!['none', 'component', 'reagent'].includes(newFlags.type)) {
        ui.notifications.error(`Invalid item type selected: ${newFlags.type}`);
        return;
      }

      if (newFlags.type === 'reagent') {
        const validEssences = ['None', 'Primal', 'Fey', 'Eldritch'];
        if (!validEssences.includes(newFlags.essence)) {
          ui.notifications.error(`Invalid essence selected: ${newFlags.essence}`);
          return;
        }
        if (isNaN(newFlags.ipValues.combat) || isNaN(newFlags.ipValues.utility) || isNaN(newFlags.ipValues.entropy)) {
          ui.notifications.error("Invalid IP values provided.");
          return;
        }
      }

      if (newFlags.type === 'component') {
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent', true);
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent', false);
      } else if (newFlags.type === 'reagent') {
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent', false);
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent', true);
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'essence', newFlags.essence);
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues', newFlags.ipValues);
      } else {
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent', false);
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent', false);
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'essence', 'None');
        await item.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues', { combat: 0, utility: 0, entropy: 0 });
      }

      const finalFlags = await this._parseItemFlags(item);
      if (!finalFlags) {
        ui.notifications.error("Failed to verify new item flags.");
        return;
      }

      const isValid = await this._verifyFlags(newFlags, finalFlags, item.name);
      if (!isValid) {
        return;
      }

      this.itemData = null;
      this.formData = {
        type: 'none',
        essence: 'None',
        ipValues: { combat: 0, utility: 0, entropy: 0 }
      };
      await this.render({ force: true });

      ui.notifications.info(`${item.name} configured successfully.`);
    } catch (error) {
      ui.notifications.error(`Failed to save configuration for ${item.name}: ${error.message}`);
    }
  }

  /**
   * Verifies that the expected flags match the actual flags on the item.
   * Provides detailed error messages if verification fails.
   * @param {Object} expected - The expected flag values from the form.
   * @param {Object} actual - The actual flag values on the item.
   * @param {string} itemName - The name of the item for error messaging.
   * @returns {boolean} True if verification passes, false otherwise.
   */
  async _verifyFlags(expected, actual, itemName) {
    try {
      let errors = [];

      if (expected.type !== actual.type) {
        errors.push(`Type mismatch: expected ${expected.type}, got ${actual.type}`);
      }

      if (expected.type === 'reagent') {
        if (expected.essence !== actual.essence) {
          errors.push(`Essence mismatch: expected ${expected.essence}, got ${actual.essence}`);
        }
        if (expected.ipValues.combat !== actual.ipValues.combat) {
          errors.push(`Combat IP mismatch: expected ${expected.ipValues.combat}, got ${actual.ipValues.combat}`);
        }
        if (expected.ipValues.utility !== actual.ipValues.utility) {
          errors.push(`Utility IP mismatch: expected ${expected.ipValues.utility}, got ${actual.ipValues.utility}`);
        }
        if (expected.ipValues.entropy !== actual.ipValues.entropy) {
          errors.push(`Entropy IP mismatch: expected ${expected.ipValues.entropy}, got ${actual.ipValues.entropy}`);
        }
      }

      if (errors.length > 0) {
        ui.notifications.error(`Flag verification failed for ${itemName}: ${errors.join('; ')}`);
        return false;
      }

      return true;
    } catch (error) {
      ui.notifications.error(`Flag verification error for ${itemName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Handles the clear button click.
   * Clears the loaded item and resets the form without modifying flags.
   * @param {Event} event - The click event.
   */
  async _handleClear(event) {
    event.preventDefault();
    this.itemData = null;
    this.formData = {
      type: 'none',
      essence: 'None',
      ipValues: { combat: 0, utility: 0, entropy: 0 }
    };
    await this.render({ force: true });
    ui.notifications.info("Item slot cleared.");
  }

  /**
   * Handles the cancel button click.
   * Closes the dialog without saving any changes.
   * @param {Event} event - The click event.
   */
  async _handleCancel(event) {
    event.preventDefault();
    await this.close();
  }

  /**
   * Cleans up the dialog on close.
   * Removes event listeners and resets internal state.
   * @param {Object} options - Options for closing the dialog.
   */
  async close(options = {}) {
    this.itemData = null;
    this.formData = null;
    const form = this._element?.[0]?.querySelector('form');
    if (form) {
      form.querySelectorAll('.drop-zone').forEach(zone => {
        zone.removeEventListener('drop', this._handleDrop);
      });
      const saveButton = form.querySelector('.save-btn');
      if (saveButton) {
        saveButton.removeEventListener('click', this._handleSave);
      }
      const clearButton = form.querySelector('.clear-btn');
      if (clearButton) {
        clearButton.removeEventListener('click', this._handleClear);
      }
      const cancelButton = form.querySelector('.cancel-btn');
      if (cancelButton) {
        cancelButton.removeEventListener('click', this._handleCancel);
      }
      const typeSelect = form.querySelector('select[name="type"]');
      if (typeSelect) {
        typeSelect.removeEventListener('change', this._handleTypeChange);
      }
    }
    return super.close(options);
  }
}
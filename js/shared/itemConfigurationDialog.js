import { capitalize } from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ItemConfigurationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.itemData = null;
    this.formData = {
      type: 'none',
      essence: 'None',
      ipValues: { combat: 0, utility: 0, entropy: 0 }
    };
    this._handleDrop = this._handleDrop.bind(this);
    this._handleSave = this._handleSave.bind(this);
    this._handleClear = this._handleClear.bind(this);
    this._handleCancel = this._handleCancel.bind(this);
    this._handleTypeChange = this._handleTypeChange.bind(this);
  }

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

  static PARTS = {
    main: {
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/itemConfigurationDialog.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.itemData = this.itemData;
    context.formData = this.formData;
    return context;
  }

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

  async _handleDrop(event) {
    event.preventDefault();
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

    // Load existing flags if any
    this.formData.type = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent') ? 'component' :
                         item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') ? 'reagent' : 'none';
    this.formData.essence = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'essence') || 'None';
    this.formData.ipValues = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };

    await this.render({ force: true });
    ui.notifications.info(`Loaded ${item.name} for configuration.`);
  }

  async _handleTypeChange(event) {
    this.formData.type = event.target.value;
    await this.render({ force: true });
  }

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

    const form = this.element.querySelector('form');
    const formData = new FormData(form);
    const updates = {};

    // Clear all relevant flags first
    updates['flags.vikarovs-guide-to-kaeliduran-crafting.-=isComponent'] = null;
    updates['flags.vikarovs-guide-to-kaeliduran-crafting.-=isReagent'] = null;
    updates['flags.vikarovs-guide-to-kaeliduran-crafting.-=essence'] = null;
    updates['flags.vikarovs-guide-to-kaeliduran-crafting.-=ipValues'] = null;

    // Set flags based on type
    if (this.formData.type === 'component') {
      updates['flags.vikarovs-guide-to-kaeliduran-crafting.isComponent'] = true;
    } else if (this.formData.type === 'reagent') {
      updates['flags.vikarovs-guide-to-kaeliduran-crafting.isReagent'] = true;
      updates['flags.vikarovs-guide-to-kaeliduran-crafting.essence'] = formData.get('essence') || 'None';
      updates['flags.vikarovs-guide-to-kaeliduran-crafting.ipValues'] = {
        combat: parseInt(formData.get('ipValues.combat')) || 0,
        utility: parseInt(formData.get('ipValues.utility')) || 0,
        entropy: parseInt(formData.get('ipValues.entropy')) || 0
      };
    }

    await item.update(updates);
    ui.notifications.info(`${item.name} configured successfully.`);
    await this.close();
  }

  async _handleClear(event) {
    event.preventDefault();
    this.itemData = null;
    this.formData = {
      type: 'none',
      essence: 'None',
      ipValues: { combat: 0, utility: 0, entropy: 0 }
    };
    await this.render({ force: true });
  }

  async _handleCancel(event) {
    event.preventDefault();
    await this.close();
  }

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
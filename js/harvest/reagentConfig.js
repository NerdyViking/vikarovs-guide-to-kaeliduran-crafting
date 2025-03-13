// js/harvest/reagentConfig.js
import { getReagentTableNames, getReagentTables, getEnvironments, getCreatureTypes, extractNpcTypeAndEnvironment } from './reagentTables.js';

// Class for the reagent configuration dialog
export class ReagentConfigDialog extends Application {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.config = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'reagentConfig') || {
      isHarvestable: false,
      isLootable: false,
      reagentTable: '',
      reagentCount: 1,
      dropRate: 100
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "reagent-config-dialog",
      title: "Configure Creature Harvesting",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/reagentConfigDialog.hbs",
      width: 500,
      height: 'auto',
      classes: ["reagent-config-dialog"],
      closeOnSubmit: true,
      submitOnClose: false
    });
  }

  getData() {
    const tables = getReagentTables();
    const tableOptions = Object.entries(tables).map(([name, table]) => ({
      id: table.id,
      name: name
    }));

    const { type, environment } = extractNpcTypeAndEnvironment(this.actor);
    let filteredTables = [...tableOptions];
    if (type || environment) {
      filteredTables = tableOptions.filter(table => {
        const tableData = tables[table.name];
        const matchesType = !type || !tableData.creatureTypes.length || tableData.creatureTypes.includes(type);
        const matchesEnvironment = !environment || tableData.environment === 'Any' || tableData.environment === environment;
        return matchesType && matchesEnvironment;
      });
    }

    return {
      config: this.config,
      tables: filteredTables,
      allTables: tableOptions,
      actorName: this.actor.name,
      actorType: type || "Unknown",
      actorEnvironment: environment || "Any"
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.type-toggle', ev => {
      ev.preventDefault();
      const type = ev.currentTarget.dataset.type;
      if (type === 'harvestable') {
        this.config.isHarvestable = true;
        this.config.isLootable = false;
      } else if (type === 'lootable') {
        this.config.isHarvestable = false;
        this.config.isLootable = true;
      }
      this.render(true);
    });

    html.on('click', '.save-config-btn', async (ev) => {
      ev.preventDefault();
      await this._onSave(html);
    });

    html.on('click', '.cancel-btn', (ev) => {
      ev.preventDefault();
      this.close();
    });

    html.on('input', 'input[type="range"]', ev => {
      const target = ev.currentTarget;
      const valueDisplay = $(target).siblings('.range-value');
      if (valueDisplay.length) {
        if (target.name === 'dropRate') {
          valueDisplay.text(target.value + '%');
        } else {
          valueDisplay.text(target.value);
        }
      }
    });
  }

  async _onSave(html) {
    // Use jQuery selectors instead of querySelector
    const tableSelect = html.find('select[name="reagentTable"]');
    const countInput = html.find('input[name="reagentCount"]');
    const dropRateInput = html.find('input[name="dropRate"]');

    // Update config
    this.config.reagentTable = tableSelect.length ? tableSelect.val() : '';
    this.config.reagentCount = countInput.length ? Math.max(1, Math.min(5, parseInt(countInput.val()) || 1)) : 1;
    this.config.dropRate = dropRateInput.length ? Math.max(0, Math.min(100, parseInt(dropRateInput.val()) || 100)) : 100;

    // Save to actor
    await this.actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'reagentConfig', this.config);
    
    this.close();
    ui.notifications.info(`Updated harvesting configuration for ${this.actor.name}.`);
  }
}

// Add header button to NPC sheet using the correct hook
Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
  // Only for GMs and NPC sheets
  if (!game.user.isGM || sheet.actor.type !== 'npc') return;

  buttons.unshift({
    label: '',
    class: 'configure-harvesting',
    icon: 'fas fa-leaf',
    tooltip: 'Configure Harvesting',
    onclick: (ev) => {
      ev.preventDefault();
      new ReagentConfigDialog(sheet.actor).render(true);
    }
  });
});
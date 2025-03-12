// js/harvest/rollTester.js
import { getReagentTables, getTableContents, rollReagents } from './reagentTables.js';

/**
 * Dialog for testing reagent table rolls
 * Allows GMs to select a table, number of rolls, and drop rate to test reagent rolling logic
 */
export class ReagentRollTester extends Application {
  constructor(options = {}) {
    super(options);
    this.selectedTable = null;
    this.rollCount = 10;
    this.dropRate = 100;
    this.results = [];
    this.statistics = {};
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "reagent-roll-tester",
      title: "Reagent Roll Tester",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/rollTester.hbs",
      width: 600,
      height: 700,
      resizable: true,
      classes: ["reagent-roll-tester"]
    });
  }

  /**
   * Get data for the dialog template
   */
  getData() {
    // Get all tables
    const tables = getReagentTables();
    
    // Format tables for dropdown
    const tableOptions = Object.entries(tables).map(([name, table]) => ({
      id: table.id,
      name: name
    }));
    
    // Get table contents if a table is selected
    let tableContents = [];
    let totalWeight = 0;
    
    if (this.selectedTable) {
      const table = Object.values(tables).find(t => t.id === this.selectedTable);
      if (table) {
        const slots = getTableContents(this.selectedTable);
        tableContents = slots.filter(slot => slot.reagentUuid).map(slot => ({
          name: slot.name,
          img: slot.img,
          weight: slot.weight || 1,
          reagentUuid: slot.reagentUuid
        }));
        
        // Calculate total weight
        totalWeight = tableContents.reduce((sum, slot) => sum + (slot.weight || 1), 0);
        
        // Calculate percentages
        tableContents.forEach(slot => {
          slot.percentage = totalWeight > 0 ? ((slot.weight / totalWeight) * 100).toFixed(2) : 0;
        });
      }
    }
    
    return {
      tables: tableOptions,
      selectedTable: this.selectedTable,
      rollCount: this.rollCount,
      dropRate: this.dropRate,
      tableContents,
      totalWeight,
      results: this.results,
      statistics: this.statistics,
      hasResults: this.results.length > 0
    };
  }

  /**
   * Activate listeners for the dialog
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Table selection
    html.find('select[name="table"]').on('change', event => {
      this.selectedTable = event.target.value;
      this.render();
    });
    
    // Roll count input
    html.find('input[name="rollCount"]').on('change', event => {
      this.rollCount = parseInt(event.target.value) || 10;
      this.render();
    });
    
    // Drop rate input
    html.find('input[name="dropRate"]').on('change', event => {
      this.dropRate = parseInt(event.target.value) || 100;
      this.render();
    });
    
    // Roll button
    html.find('.roll-button').on('click', async () => {
      await this._performRolls();
      this.render();
    });
    
    // Quick roll buttons
    html.find('.quick-roll-button').on('click', async event => {
      const count = parseInt(event.currentTarget.dataset.count) || 1;
      this.rollCount = count;
      await this._performRolls();
      this.render();
    });
    
    // Clear button
    html.find('.clear-button').on('click', () => {
      this.results = [];
      this.statistics = {};
      this.render();
    });
    
    // Item inspection
    html.find('.result-item').on('click', async event => {
      const uuid = event.currentTarget.dataset.uuid;
      if (uuid) {
        try {
          const item = await fromUuid(uuid);
          if (item) {
            item.sheet.render(true);
          }
        } catch (error) {
          console.error("Failed to open item sheet:", error);
        }
      }
    });
  }

  /**
   * Perform the rolls and update results
   */
  async _performRolls() {
    if (!this.selectedTable) {
      ui.notifications.warn("Please select a reagent table first.");
      return;
    }
    
    // Reset results
    this.results = [];
    this.statistics = {};
    
    // Roll the specified number of times
    const rolledItems = await rollReagents(this.selectedTable, this.rollCount, this.dropRate);
    
    // Process results
    this.results = rolledItems.map(item => ({
      name: item.name,
      img: item.img,
      uuid: item.uuid
    }));
    
    // Calculate statistics
    const tally = {};
    for (const item of this.results) {
      tally[item.name] = (tally[item.name] || 0) + 1;
    }
    
    const totalRolls = this.results.length;
    this.statistics = Object.entries(tally).map(([name, count]) => {
      const item = this.results.find(r => r.name === name);
      return {
        name,
        img: item?.img,
        count,
        percentage: totalRolls > 0 ? ((count / totalRolls) * 100).toFixed(2) : 0
      };
    }).sort((a, b) => b.count - a.count);
    
    if (this.results.length === 0) {
      ui.notifications.info(`No reagents were rolled. This could be due to the drop rate (${this.dropRate}%) or an empty table.`);
    } else {
      ui.notifications.info(`Rolled ${this.results.length} reagents from ${this.rollCount} attempts.`);
    }
  }
}

/**
 * Add a button to the reagent table editor to open the roll tester
 */
Hooks.on('renderReagentTableEditor', (app, html) => {
  // Only show for GMs
  if (!game.user.isGM) return;
  
  // Add button to the footer
  const footer = html.find('.form-buttons');
  if (footer.length) {
    const button = $(`
      <button type="button" class="test-rolls-btn">
        <i class="fas fa-dice"></i> Test Rolls
      </button>
    `);
    
    // Add click handler
    button.on('click', () => {
      new ReagentRollTester().render(true);
    });
    
    // Add to the footer before the save button
    footer.prepend(button);
  }
});

// Register global hotkey to open the roll tester (Ctrl+Shift+R)
Hooks.once('ready', () => {
  // Only register for GMs
  if (!game.user.isGM) return;
  
  game.keybindings.register('vikarovs-guide-to-kaeliduran-crafting', 'open-roll-tester', {
    name: 'Open Reagent Roll Tester',
    hint: 'Opens the reagent roll testing tool',
    editable: [
      {
        key: 'KeyR',
        modifiers: ['Control', 'Shift']
      }
    ],
    onDown: () => {
      new ReagentRollTester().render(true);
      return true;
    }
  });
});

// Add a button to the module settings
Hooks.on('renderSettings', (app, html) => {
  // Only show for GMs
  if (!game.user.isGM) return;
  
  // Find the module's settings section
  const moduleId = 'vikarovs-guide-to-kaeliduran-crafting';
  const moduleSection = html.find(`section[data-module-id="${moduleId}"]`);
  if (moduleSection.length) {
    const button = $(`
      <button type="button" class="open-roll-tester">
        <i class="fas fa-dice"></i> Open Roll Tester
      </button>
    `);
    
    // Style the button
    button.css({
      marginTop: '10px',
      display: 'block'
    });
    
    // Add click handler
    button.on('click', () => {
      app.close();
      new ReagentRollTester().render(true);
    });
    
    // Add the button to the end of the module section
    moduleSection.append(button);
  }
});
// js/harvest/reagentTableEditor.js

import { 
  getReagentTables, 
  getReagentTableContents, 
  getEnvironments, 
  getCreatureTypes,
  createReagentTable,
  updateReagentTable,
  deleteReagentTable,
  addReagentSlot,
  updateReagentSlot,
  deleteReagentSlot
} from './reagentTables.js';

// Register a Handlebars helper for checking if a value is in an array
Handlebars.registerHelper('contains', function(array, value) {
  if (!array) return false;
  return array.includes(value);
});

/**
 * Reagent Table Editor Application
 * Allows GMs to create, edit, and manage reagent tables for the harvesting system
 */
export class ReagentTableEditor extends Application {
  constructor(options = {}) {
    super(options);
    this.selectedTable = null;
    this.editMode = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "reagent-table-editor",
      title: "Harvest/Loot Tables Editor",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/reagentTableEditor.hbs",
      width: 960,
      height: 700,
      resizable: true,
      classes: ["reagent-table-editor"]
    });
  }

  /**
   * Get data for the template
   */
  getData() {
    // Get all tables and their contents
    const tables = getReagentTables();
    const tableContents = getReagentTableContents();
    
    // Format tables for display
    const tableList = Object.entries(tables).map(([name, table]) => {
      const slots = tableContents[table.id] || [];
      const slotCount = slots.length;
      
      return {
        name,
        id: table.id,
        description: table.description,
        environment: table.environment,
        creatureTypes: table.creatureTypes,
        slotCount,
        isSelected: this.selectedTable === name
      };
    });
    
    // Get selected table details
    let selectedTableDetails = null;
    let tableSlots = [];
    
    if (this.selectedTable) {
      const table = tables[this.selectedTable];
      if (table) {
        selectedTableDetails = table;
        tableSlots = tableContents[table.id] || [];
        
        // Check if we already have an empty slot
        const hasEmptySlot = tableSlots.some(slot => !slot.reagentUuid);
        
        // Always add one empty slot for drag-and-drop if in edit mode and there's no empty slot already
        if (this.editMode && !hasEmptySlot) {
          tableSlots.push({ isEmpty: true });
        }
      }
    }
    
    // Get environments and creature types for dropdowns
    const environments = getEnvironments();
    const creatureTypes = getCreatureTypes();
    
    return {
      tables: tableList,
      environments,
      creatureTypes,
      selectedTable: selectedTableDetails,
      tableSlots,
      editMode: this.editMode
    };
  }

  /**
   * Activate listeners for the editor
// Updated activateListeners function for ReagentTableEditor class

/**
 * Activate listeners for the editor
 */
activateListeners(html) {
  super.activateListeners(html);
  
  const self = this;
  
  // Table selection
  html.find('.table-item').click(event => {
    const tableName = event.currentTarget.dataset.tableName;
    this.selectedTable = tableName;
    this.render(true); // Force re-render to refresh the UI
  });
  
  // Create new table button
  html.find('.create-table-btn').click(event => {
    event.preventDefault();
    this._onCreateTable();
  });
  
  // Delete table button
  html.find('.delete-table-btn').click(event => {
    event.preventDefault();
    const tableName = event.currentTarget.closest('.table-item').dataset.tableName;
    this._onDeleteTable(tableName);
  });
  
  // Toggle edit mode
  html.find('.toggle-edit-btn').click(event => {
    event.preventDefault();
    this.editMode = !this.editMode;
    this.render(true); // Force re-render to refresh the UI
  });
  
  // Save table changes
  html.find('.save-table-btn').click(event => {
    event.preventDefault();
    this._onSaveTable();
  });
  
  // Handle reagent slot weight changes
  html.find('.reagent-weight-input').change(event => {
    // Will be implemented when we save reagent slots
  });
  
  // Remove reagent from slot
  html.find('.remove-reagent-btn').click(event => {
    event.preventDefault();
    const slotIndex = parseInt(event.currentTarget.closest('.reagent-slot').dataset.slotIndex);
    this._onRemoveReagent(slotIndex);
  });
  
  // NEW: Make reagent items clickable to open their sheet
  html.find('.reagent-item').click(async event => {
    // Don't proceed if the click was on a button or input
    if ($(event.target).is('button') || $(event.target).is('input')) {
      return;
    }
    
    const slotElement = $(event.currentTarget).closest('.reagent-slot');
    if (!slotElement.length) return;
    
    const slotIndex = parseInt(slotElement.data('slot-index'));
    if (isNaN(slotIndex)) return;
    
    // Get table data
    if (!this.selectedTable) return;
    const tables = getReagentTables();
    const table = tables[this.selectedTable];
    if (!table) return;
    
    // Get slot data
    const tableContents = getReagentTableContents();
    const slots = tableContents[table.id] || [];
    if (!slots[slotIndex]) return;
    
    // Get item from uuid
    try {
      const reagentUuid = slots[slotIndex].reagentUuid;
      if (!reagentUuid) return;
      
      const item = await fromUuid(reagentUuid);
      if (item) {
        item.sheet.render(true);
      } else {
        ui.notifications.warn("Unable to find item in the game.");
      }
    } catch (error) {
      console.error("Error opening item sheet:", error);
      ui.notifications.error("Failed to open item sheet.");
    }
  });
  
  // Setup drag-and-drop for reagents
  this._setupDragDrop(html);
}

  /**
   * Set up drag and drop functionality
   */
  _setupDragDrop(html) {
    // Make reagent slots droppable
    html.find('.reagent-drop-zone').each((i, el) => {
      const dropZone = $(el);
      
      // Handle dragover
      dropZone.on('dragover', event => {
        event.preventDefault();
        dropZone.addClass('dragover');
      });
      
      // Handle dragleave
      dropZone.on('dragleave', event => {
        event.preventDefault();
        dropZone.removeClass('dragover');
      });
      
      // Handle drop
      dropZone.on('drop', async event => {
        event.preventDefault();
        dropZone.removeClass('dragover');
        
        try {
          // Parse the dropped data
          const dataTransfer = event.originalEvent.dataTransfer;
          const data = JSON.parse(dataTransfer.getData('text/plain'));
          
          if (data.type !== 'Item') {
            ui.notifications.warn("Only items can be dropped here.");
            return;
          }
          
          // Get the item and check if it's a reagent
          const item = await fromUuid(data.uuid);
          if (!item) {
            ui.notifications.error("Failed to load item.");
            return;
          }
          
          const isReagent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') === true;
          if (!isReagent) {
            ui.notifications.warn("Only reagents can be added to harvest tables.");
            return;
          }
          
          // Get the slot index from the parent element
          const slotElement = dropZone.closest('.reagent-slot');
          if (!slotElement.length) {
            ui.notifications.error("Could not determine slot index.");
            return;
          }
          
          const slotIndex = parseInt(slotElement.data('slot-index'));
          if (isNaN(slotIndex)) {
            ui.notifications.error("Invalid slot index.");
            return;
          }
          
          // Add to the table
          await this._onAddReagent(slotIndex, item);
        } catch (error) {
          console.error("Failed to process dropped item:", error);
          ui.notifications.error("Failed to add reagent to table.");
        }
      });
    });
  }

  /**
   * Handle creating a new table
   */
  async _onCreateTable() {
    const dialog = new Dialog({
      title: "Create New Reagent Table",
      content: `
        <form>
          <div class="form-group">
            <label>Table Name:</label>
            <input type="text" name="tableName" placeholder="Enter table name">
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" placeholder="Enter table description"></textarea>
          </div>
        </form>
      `,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Create",
          callback: async (html) => {
            const form = html.find('form')[0];
            const tableName = form.tableName.value.trim();
            const description = form.description.value.trim();
            
            if (!tableName) {
              ui.notifications.error("Table name is required.");
              return;
            }
            
            const success = await createReagentTable(tableName, {
              description,
              environment: "Any",
              creatureTypes: []
            });
            
            if (success) {
              ui.notifications.info(`Table "${tableName}" created.`);
              this.selectedTable = tableName;
              this.editMode = true;
              this.render(true); // Force re-render to refresh the UI
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "create"
    });
    
    dialog.render(true);
  }

  /**
   * Handle deleting a table
   */
  async _onDeleteTable(tableName) {
    const confirmed = await Dialog.confirm({
      title: "Delete Reagent Table",
      content: `<p>Are you sure you want to delete the table "${tableName}"?</p><p>This action cannot be undone.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    
    if (confirmed) {
      const success = await deleteReagentTable(tableName);
      if (success) {
        ui.notifications.info(`Table "${tableName}" deleted.`);
        if (this.selectedTable === tableName) {
          this.selectedTable = null;
        }
        this.render(true); // Force re-render to refresh the UI
      }
    }
  }

  /**
     * Handle saving table changes
     */
  async _onSaveTable() {
    if (!this.selectedTable) return;
    
    const form = this.element.find('form.table-edit-form')[0];
    if (!form) return;
    
    // Get basic table info
    const name = form.tableName.value.trim();
    const description = form.tableDescription.value.trim();
    
    // Get selected environment
    const environment = form.environment.value;
    
    // Get selected creature type
    const creatureType = form.creatureType.value;
    const creatureTypes = creatureType ? [creatureType] : [];
    
    // Update the table
    const success = await updateReagentTable(this.selectedTable, {
      name,
      description,
      environment,
      creatureTypes
    });
    
    if (success) {
      ui.notifications.info(`Table "${name}" updated.`);
      this.render(true);
    }
  }

  /**
   * Handle adding a reagent to a slot
   */
  async _onAddReagent(slotIndex, item) {
    if (!this.selectedTable) {
      ui.notifications.error("No table selected.");
      return;
    }
    
    const tables = getReagentTables();
    const table = tables[this.selectedTable];
    if (!table) {
      ui.notifications.error("Selected table not found.");
      return;
    }
    
    try {
      // Add the reagent to the table
      const success = await addReagentSlot(table.id, item.uuid);
      
      if (success) {
        ui.notifications.info(`Added ${item.name} to table.`);
        this.render(true);
      }
    } catch (error) {
      console.error("Error adding reagent:", error);
      ui.notifications.error("Failed to add reagent to table.");
    }
  }

  /**
   * Handle removing a reagent from a slot
   */
  async _onRemoveReagent(slotIndex) {
    if (!this.selectedTable) return;
    
    const tables = getReagentTables();
    const table = tables[this.selectedTable];
    if (!table) return;
    
    // Remove the reagent from the table
    const success = await deleteReagentSlot(table.id, slotIndex);
    
    if (success) {
      ui.notifications.info("Reagent removed from table.");
      this.render();
    }
  }
}
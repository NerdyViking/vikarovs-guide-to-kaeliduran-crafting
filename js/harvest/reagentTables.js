// js/harvest/reagentTables.js

/**
 * Manages reagent tables for the harvesting system.
 * Provides functions to create, edit, and roll from reagent tables.
 */

// Initialize module settings for reagent tables
Hooks.once('init', () => {
    // Register settings for reagent tables
    game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'reagentTables', {
      name: 'Reagent Table Definitions',
      hint: 'Definitions for reagent tables used in harvesting',
      scope: 'world',
      config: false,
      type: Object,
      default: {
        // Default tables with basic definitions
        "Forest": {
          id: "forest",
          name: "Forest",
          description: "Common reagents found in forest environments",
          environment: "Forest",
          creatureTypes: ["Beast", "Plant", "Fey"]
        },
        "Mountain": {
          id: "mountain",
          name: "Mountain",
          description: "Reagents from mountainous regions",
          environment: "Mountain",
          creatureTypes: ["Beast", "Dragon", "Giant"]
        },
        "Underdark": {
          id: "underdark",
          name: "Underdark",
          description: "Exotic reagents from the depths below",
          environment: "Underdark",
          creatureTypes: ["Aberration", "Monstrosity", "Undead"]
        },
        "Urban": {
          id: "urban",
          name: "Urban",
          description: "Reagents commonly found in cities and towns",
          environment: "Urban",
          creatureTypes: ["Humanoid"]
        }
      }
    });
  
    // Register settings for table contents (slots)
    game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents', {
      name: 'Reagent Table Contents',
      hint: 'Contents (slots) for reagent tables',
      scope: 'world',
      config: false,
      type: Object,
      default: {
        // Each table ID maps to an array of slots
        "forest": [],
        "mountain": [],
        "underdark": [],
        "urban": []
      }
    });
  
    // Settings for enabling/disabling features
    game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'enableHarvesting', {
      name: 'Enable Harvesting',
      hint: 'Enable the harvesting mechanic for creatures',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });
    
    game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'enableLooting', {
      name: 'Enable Looting',
      hint: 'Enable the special looting mechanic for creatures',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });
    
    game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'autoConvertTokens', {
      name: 'Auto-Convert Tokens',
      hint: 'Automatically convert defeated tokens without prompting',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });
  });
  
  /**
   * Get a list of all reagent table names
   * @returns {Array} Array of table names
   */
  export function getReagentTableNames() {
    const tables = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'reagentTables');
    return Object.keys(tables);
  }
  
  /**
   * Get all reagent table definitions
   * @returns {Object} Object with all table definitions
   */
  export function getReagentTables() {
    return game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'reagentTables');
  }
  
  /**
   * Get a specific reagent table definition
   * @param {string} tableName - Name of the table to retrieve
   * @returns {Object|null} Table definition or null if not found
   */
  export function getReagentTable(tableName) {
    const tables = getReagentTables();
    return tables[tableName] || null;
  }
  
  /**
   * Get all reagent table contents
   * @returns {Object} Object mapping table IDs to arrays of slots
   */
  export function getReagentTableContents() {
    return game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents');
  }
  
  /**
   * Get contents (slots) for a specific table
   * @param {string} tableId - ID of the table
   * @returns {Array} Array of slot objects
   */
  export function getTableContents(tableId) {
    const contents = getReagentTableContents();
    return contents[tableId] || [];
  }
  
  /**
   * Create a new reagent table
   * @param {string} name - Display name of the table
   * @param {Object} options - Table options
   * @param {string} options.description - Table description
   * @param {string} options.environment - Environment tag
   * @param {Array} options.creatureTypes - Array of creature type tags
   * @returns {Promise<boolean>} Success status
   */
  export async function createReagentTable(name, options = {}) {
    const tables = getReagentTables();
    const tableContents = getReagentTableContents();
    
    // Generate ID from name
    const id = name.toLowerCase().replace(/\s+/g, '-');
    
    if (tables[name]) {
      ui.notifications.warn(`A table named '${name}' already exists.`);
      return false;
    }
    
    tables[name] = {
      id,
      name,
      description: options.description || "",
      environment: options.environment || "Any",
      creatureTypes: options.creatureTypes || []
    };
    
    // Initialize empty slots array
    tableContents[id] = [];
    
    try {
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTables', tables);
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents', tableContents);
      return true;
    } catch (error) {
      console.error("Failed to create reagent table:", error);
      ui.notifications.error("Failed to create reagent table");
      return false;
    }
  }
  
  /**
   * Update a reagent table definition
   * @param {string} name - Name of the table to update
   * @param {Object} updates - Properties to update
   * @returns {Promise<boolean>} Success status
   */
  export async function updateReagentTable(name, updates = {}) {
    const tables = getReagentTables();
    
    if (!tables[name]) {
      ui.notifications.warn(`Table '${name}' not found.`);
      return false;
    }
    
    // Update properties
    tables[name] = {
      ...tables[name],
      ...updates
    };
    
    try {
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTables', tables);
      return true;
    } catch (error) {
      console.error("Failed to update reagent table:", error);
      ui.notifications.error("Failed to update reagent table");
      return false;
    }
  }
  
  /**
   * Delete a reagent table
   * @param {string} name - Name of the table to delete
   * @returns {Promise<boolean>} Success status
   */
  export async function deleteReagentTable(name) {
    const tables = getReagentTables();
    const tableContents = getReagentTableContents();
    
    if (!tables[name]) {
      ui.notifications.warn(`Table '${name}' not found.`);
      return false;
    }
    
    const tableId = tables[name].id;
    
    // Delete the table and its contents
    delete tables[name];
    delete tableContents[tableId];
    
    try {
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTables', tables);
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents', tableContents);
      return true;
    } catch (error) {
      console.error("Failed to delete reagent table:", error);
      ui.notifications.error("Failed to delete reagent table");
      return false;
    }
  }
  
  /**
   * Add a reagent slot to a table
   * @param {string} tableId - ID of the table
   * @param {string} reagentUuid - UUID of the reagent item
   * @param {number} weight - Weight of the reagent (for rolling)
   * @returns {Promise<boolean>} Success status
   */
  export async function addReagentSlot(tableId, reagentUuid, weight = 1) {
    const tableContents = getReagentTableContents();
    
    if (!tableContents[tableId]) {
      tableContents[tableId] = [];
    }
    
    try {
      // Verify the item exists and is a reagent
      const item = await fromUuid(reagentUuid);
      if (!item) {
        ui.notifications.warn("Item not found.");
        return false;
      }
      
      // Check if it's a reagent
      const isReagent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') === true;
      if (!isReagent) {
        ui.notifications.warn("This item is not a reagent.");
        return false;
      }
      
      // Add the slot
      tableContents[tableId].push({
        reagentUuid,
        weight: Math.max(1, weight), // Ensure weight is at least 1
        name: item.name,
        img: item.img,
      });
      
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents', tableContents);
      return true;
    } catch (error) {
      console.error("Failed to add reagent slot:", error);
      ui.notifications.error("Failed to add reagent slot");
      return false;
    }
  }
  
  /**
   * Update a reagent slot in a table
   * @param {string} tableId - ID of the table
   * @param {number} slotIndex - Index of the slot to update
   * @param {Object} updates - Properties to update
   * @returns {Promise<boolean>} Success status
   */
  export async function updateReagentSlot(tableId, slotIndex, updates = {}) {
    const tableContents = getReagentTableContents();
    
    if (!tableContents[tableId] || !tableContents[tableId][slotIndex]) {
      ui.notifications.warn("Reagent slot not found.");
      return false;
    }
    
    try {
      // If updating the reagent, verify it exists
      if (updates.reagentUuid) {
        const item = await fromUuid(updates.reagentUuid);
        if (!item) {
          ui.notifications.warn("Item not found.");
          return false;
        }
        
        // Check if it's a reagent
        const isReagent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') === true;
        if (!isReagent) {
          ui.notifications.warn("This item is not a reagent.");
          return false;
        }
        
        // Update with item details
        updates.name = item.name;
        updates.img = item.img;
      }
      
      // Update the slot
      tableContents[tableId][slotIndex] = {
        ...tableContents[tableId][slotIndex],
        ...updates
      };
      
      // Ensure weight is at least 1
      if (tableContents[tableId][slotIndex].weight < 1) {
        tableContents[tableId][slotIndex].weight = 1;
      }
      
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents', tableContents);
      return true;
    } catch (error) {
      console.error("Failed to update reagent slot:", error);
      ui.notifications.error("Failed to update reagent slot");
      return false;
    }
  }
  
  /**
   * Delete a reagent slot from a table
   * @param {string} tableId - ID of the table
   * @param {number} slotIndex - Index of the slot to delete
   * @returns {Promise<boolean>} Success status
   */
  export async function deleteReagentSlot(tableId, slotIndex) {
    const tableContents = getReagentTableContents();
    
    if (!tableContents[tableId] || !tableContents[tableId][slotIndex]) {
      ui.notifications.warn("Reagent slot not found.");
      return false;
    }
    
    try {
      // Remove the slot
      tableContents[tableId].splice(slotIndex, 1);
      
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'reagentTableContents', tableContents);
      return true;
    } catch (error) {
      console.error("Failed to delete reagent slot:", error);
      ui.notifications.error("Failed to delete reagent slot");
      return false;
    }
  }
  
  /**
   * Roll for reagents from a table
   * @param {string} tableId - ID of the table to roll from
   * @param {number} count - Number of reagents to roll for
   * @param {number} dropRate - Percentage chance (0-100) for each roll to yield a reagent
   * @returns {Promise<Array>} Array of rolled reagent items
   */
  export async function rollReagents(tableId, count = 1, dropRate = 100) {
    const slots = getTableContents(tableId);
    const results = [];
    
    // If no slots or empty table, return empty array
    if (!slots || !slots.length) {
      console.warn(`No reagents in table '${tableId}'`);
      return results;
    }
    
    // Filter slots that have reagents
    const validSlots = slots.filter(slot => slot.reagentUuid);
    if (!validSlots.length) {
      console.warn(`No valid reagents in table '${tableId}'`);
      return results;
    }
    
    // Calculate total weight
    const totalWeight = validSlots.reduce((sum, slot) => sum + (Math.max(1, slot.weight || 1)), 0);
    
    // First check if we should roll at all (based on overall drop rate)
    if (Math.random() * 100 > dropRate) {
      console.log(`Table '${tableId}' failed drop rate check (${dropRate}%)`);
      return results;
    }
    
    // Roll for each count - if we reached this point, we're guaranteed to roll
    for (let i = 0; i < count; i++) {
      // Roll the weighted die (1 to totalWeight)
      const rollResult = Math.floor(Math.random() * totalWeight) + 1;
      
      // Find which item bucket the roll falls into
      let accumulatedWeight = 0;
      let rolled = false;
      
      for (const slot of validSlots) {
        const slotWeight = Math.max(1, slot.weight || 1);
        accumulatedWeight += slotWeight;
        
        if (rollResult <= accumulatedWeight) {
          rolled = true;
          
          try {
            const item = await fromUuid(slot.reagentUuid);
            if (item) {
              results.push(item);
              console.log(`Rolled reagent: ${item.name} (Weight: ${slotWeight}/${totalWeight})`);
            } else {
              ui.notifications.warn(`Failed to find reagent item. Please verify the item exists.`);
              console.warn(`Item with UUID ${slot.reagentUuid} not found`);
            }
          } catch (error) {
            ui.notifications.warn(`Failed to resolve reagent item. Please verify the item exists.`);
            console.error(`Failed to resolve item ${slot.reagentUuid}:`, error);
          }
          
          break; // Stop searching once we've found our match
        }
      }
      
      // Sanity check - should never happen if weights are calculated correctly
      if (!rolled) {
        console.error(`Failed to roll reagent from table '${tableId}'. Total weight: ${totalWeight}, Roll: ${rollResult}`);
      }
    }
    
    return results;
  }
  
  /**
   * Roll reagents for an NPC based on its configuration
   * @param {Actor} npc - The NPC actor
   * @returns {Promise<Array>} Array of rolled reagent items
   */
  export async function rollNpcReagents(npc) {
    if (!npc) {
      console.error("Invalid NPC provided to rollNpcReagents");
      return [];
    }
    
    // Get NPC configuration
    const config = npc.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'reagentConfig') || {};
    const {
      isHarvestable = false,
      isLootable = false,
      reagentTable = "",
      reagentCount = 1,
      dropRate = 100
    } = config;
    
    // If not configured as harvestable or lootable, return empty
    if (!isHarvestable && !isLootable) {
      console.log(`NPC ${npc.name} is not configured as harvestable or lootable`);
      return [];
    }
    
    // Verify we have a table
    if (!reagentTable) {
      console.warn(`NPC ${npc.name} has no reagent table configured`);
      return [];
    }
    
    // Get table ID from name
    const tables = getReagentTables();
    const tableData = Object.values(tables).find(t => t.name === reagentTable || t.id === reagentTable);
    
    if (!tableData) {
      console.warn(`Reagent table '${reagentTable}' not found for NPC ${npc.name}`);
      return [];
    }
    
    // Roll reagents
    const results = await rollReagents(tableData.id, reagentCount, dropRate);
    
    // Log results
    if (results.length > 0) {
      console.log(`NPC ${npc.name} yielded ${results.length} reagents:`, 
        results.map(item => item.name).join(", "));
    } else {
      console.log(`NPC ${npc.name} yielded no reagents`);
    }
    
    return results;
  }
  
  /**
   * Get standard D&D creature types
   * @returns {Array} Array of creature type objects
   */
  export function getCreatureTypes() {
    return [
      { id: "aberration", name: "Aberration" },
      { id: "beast", name: "Beast" },
      { id: "celestial", name: "Celestial" },
      { id: "construct", name: "Construct" },
      { id: "dragon", name: "Dragon" },
      { id: "elemental", name: "Elemental" },
      { id: "fey", name: "Fey" },
      { id: "fiend", name: "Fiend" },
      { id: "giant", name: "Giant" },
      { id: "humanoid", name: "Humanoid" },
      { id: "monstrosity", name: "Monstrosity" },
      { id: "ooze", name: "Ooze" },
      { id: "plant", name: "Plant" },
      { id: "undead", name: "Undead" },
      { id: "custom", name: "Custom" }
    ];
  }
  
  /**
   * Get standard D&D environments/habitats
   * @returns {Array} Array of environment objects
   */
  export function getEnvironments() {
    return [
      { id: "any", name: "Any" },
      { id: "arctic", name: "Arctic" },
      { id: "coastal", name: "Coastal" },
      { id: "desert", name: "Desert" },
      { id: "forest", name: "Forest" },
      { id: "grassland", name: "Grassland" },
      { id: "hill", name: "Hill" },
      { id: "mountain", name: "Mountain" },
      { id: "planar", name: "Planar" },
      { id: "swamp", name: "Swamp" },
      { id: "underdark", name: "Underdark" },
      { id: "underwater", name: "Underwater" },
      { id: "urban", name: "Urban" },
      { id: "custom", name: "Custom" }
    ];
  }
  
  /**
   * Extract creature type and environment from an NPC
   * @param {Actor} npc - The NPC actor
   * @returns {Object} Object with creature type and environment
   */
  export function extractNpcTypeAndEnvironment(npc) {
    if (!npc) return { type: null, subtype: null, environment: null };
    
    // This implementation may need to be adjusted based on the specific
    // structure of NPC data in your Foundry implementation
    const type = npc.system?.details?.type?.value || null;
    const subtype = npc.system?.details?.type?.subtype || null;
    const environment = npc.system?.details?.environment || null;
    
    return { type, subtype, environment };
  }
console.log("utils.js loaded");

import { GroupManager } from './groupManager.js';

// Helper function to strip HTML tags
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, '').trim();
}

// Check if an item is a component
export function isComponent(item) {
  return item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent") === true;
}

// Check if an item is a reagent
export function isReagent(item) {
  return item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") === true;
}

// Calculate IP sums for reagents
export function calculateIPSums(reagents) {
  if (!Array.isArray(reagents) || reagents.length !== 3) {
    console.warn("calculateIPSums: Expected 3 reagents");
    return [0, 0, 0];
  }

  const sums = reagents.reduce(
    (acc, reagent) => {
      const ipValues = reagent.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
      acc[0] += ipValues.combat || 0;
      acc[1] += ipValues.utility || 0;
      acc[2] += ipValues.entropy || 0;
      return acc;
    },
    [0, 0, 0]
  );

  return sums; // [combatSum, utilitySum, entropySum]
}

// Get reagent cost based on rarity
export function getReagentCost(rarity) {
  const costs = {
    common: 10,
    uncommon: 50,
    rare: 600,
    veryRare: 6000,
    legendary: 50000,
  };
  return costs[rarity] || 0;
}

// Handlebars Helpers
Handlebars.registerHelper('times', function(n, block) {
  let accum = '';
  for (let i = 0; i < n; ++i) {
    block.data.index = i;
    block.data.first = i === 0;
    block.data.last = i === (n - 1);
    accum += block.fn(this);
  }
  return accum;
});

Handlebars.registerHelper('add', function(a, b) {
  return parseInt(a) + parseInt(b);
});

Handlebars.registerHelper('range', function(start, end) {
  const range = [];
  start = parseInt(start) || 0;
  end = parseInt(end) || 0;
  for (let i = start; i < end; i++) {
    range.push(i);
  }
  return range;
});

Handlebars.registerHelper('formatNumber', (number) => {
  if (typeof number !== 'number') {
    number = parseInt(number) || 0;
  }
  return number.toLocaleString('en-US');
});

Handlebars.registerHelper('includes', function(array, value) {
  if (!Array.isArray(array)) return false;
  return array.includes(value);
});

// Get base gold cost for a rarity (used for upgrade costs)
export function getRarityGoldCost(rarity) {
  const costs = {
    uncommon: 400,
    rare: 4000,
    veryRare: 40000,
    legendary: 200000
  };
  return costs[rarity.toLowerCase()] || 0;
}

// Capitalize a string (e.g., "standard" -> "Standard")
export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Register API and migrate data on init
Hooks.once("init", async () => {
  game.modules.get("vikarovs-guide-to-kaeliduran-crafting").api = {
    getRarityGoldCost,
    capitalize,
    groupManager: GroupManager
  };

  // Migrate existing craftingGroups data if it exists
  const settingKey = 'vikarovs-guide-to-kaeliduran-crafting.craftingGroups';
  if (game.settings.settings.has(settingKey)) {
    const oldGroups = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups') || {};
    if (Object.keys(oldGroups).length) {
      const activeGroups = {};
      const recipes = foundry.utils.deepClone(
        game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes')
      );

      for (const [groupId, group] of Object.entries(oldGroups)) {
        if (group.isPartyGroup) {
          activeGroups[groupId] = true;
          // Update recipe allowedGroups
          for (const recipe of Object.values(recipes)) {
            if (recipe.allowedGroups?.includes(groupId)) {
              recipe.allowedGroups = recipe.allowedGroups.filter(id => id !== groupId).concat([groupId]);
            }
          }
          // Migrate crafting memory
          for (const actor of game.actors.filter(a => a.type === "character")) {
            const oldMemory = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${groupId}`);
            if (oldMemory) {
              await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${groupId}`, oldMemory);
              await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${groupId}`);
            }
            await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId');
          }
        }
      }

      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups', activeGroups);
      // Clear the old craftingGroups setting
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups', {});
      ui.notifications.info('Crafting groups migrated to new system.');
    }
  }
});

export const sharedUtilities = () => {
  // Placeholder for shared utility functions
};
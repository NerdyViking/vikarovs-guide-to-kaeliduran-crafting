console.log("utils.js loaded");

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

// New helper to check if an actor ID is in an array
Handlebars.registerHelper('isInArray', function(array, value) {
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

// Register API on init
Hooks.once("init", () => {
  game.modules.get("vikarovs-guide-to-kaeliduran-crafting").api = {
    getRarityGoldCost,
    capitalize
  };
});

export const sharedUtilities = () => {
  // Placeholder for shared utility functions
};
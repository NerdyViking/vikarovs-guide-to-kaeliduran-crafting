console.log("utils.js loaded");

// Helper function to strip HTML tags
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, '').trim();
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

// Helper to format numbers with commas
Handlebars.registerHelper('formatNumber', (number) => {
  if (typeof number !== 'number') {
    number = parseInt(number) || 0;
  }
  return number.toLocaleString('en-US'); // Adds commas (e.g., 1000 -> 1,000)
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
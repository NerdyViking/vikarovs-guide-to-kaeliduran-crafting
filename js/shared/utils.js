// Placeholder for shared utilities
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

export const sharedUtilities = () => {
  // Placeholder for shared utility functions
};
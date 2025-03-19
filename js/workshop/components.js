// js/workshop/components.js (final for Phase 1)
console.log("components.js loaded");

Hooks.on("renderItemSheet", (app, html, data) => {
  if (app.item.type !== "loot") return;

  const typeSelect = html.find('select[name="system.type.value"]');
  
  // Ensure "Component" option exists in the dropdown
  if (!typeSelect.find('option[value="component"]').length) {
    typeSelect.append('<option value="component">Component</option>');
  }

  // Set initial selection
  typeSelect.val(app.item.system.type.value);

  // Handle type change to set/unset isComponent flag
  typeSelect.on("change", async (event) => {
    const value = event.target.value;
    const isComponent = value === "component";
    await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent", isComponent);
    if (value !== app.item.system.type.value) {
      await app.item.update({ "system.type.value": value }); // Persist type change
    } else {
      app.render(false); // Re-render without full reload
    }
  });
});

// Helper function to check if an item is a component
export function isComponent(item) {
  return item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent") === true;
}
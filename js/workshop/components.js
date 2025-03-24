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

  // Add component type dropdown if the item is a component
  const isComponent = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent") || false;
  if (isComponent) {
    const componentType = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "componentType") || "None";
    const propertiesSection = html.find(".form-group.stacked.checkbox-grid");
    if (propertiesSection.length) {
      propertiesSection.find("label").text("Component Properties");
      propertiesSection.find(".form-fields").html(`
        <div style="text-align: center;">
          <label>Type</label>
          <select name="flags.vikarovs-guide-to-kaeliduran-crafting.componentType" style="width: 107.63px;">
            <option value="None" ${componentType === "None" ? "selected" : ""}>None</option>
            <option value="Primal" ${componentType === "Primal" ? "selected" : ""}>Primal</option>
            <option value="Fey" ${componentType === "Fey" ? "selected" : ""}>Fey</option>
            <option value="Eldritch" ${componentType === "Eldritch" ? "selected" : ""}>Eldritch</option>
          </select>
        </div>
      `);

      // Sync changes to flags on submit
      html.find("form").on("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const updates = {
          "flags.vikarovs-guide-to-kaeliduran-crafting.isComponent": true,
          "flags.vikarovs-guide-to-kaeliduran-crafting.componentType": formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.componentType") || "None"
        };
        await app.item.update(updates);
      });

      // Sync changes on close
      app.element.on("close", async () => {
        const formData = new FormData(html.find("form")[0]);
        const updates = {
          "flags.vikarovs-guide-to-kaeliduran-crafting.isComponent": true,
          "flags.vikarovs-guide-to-kaeliduran-crafting.componentType": formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.componentType") || "None"
        };
        await app.item.update(updates);
      });
    }
  }
});

// Helper function to check if an item is a component
export function isComponent(item) {
  return item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent") === true;
}
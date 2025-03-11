// js/alchemy/reagents.js
console.log("reagents.js loaded");

Hooks.on("renderItemSheet", (app, html, data) => {
  if (app.item.type !== "loot") return;

  const typeSelect = html.find('select[name="system.type.value"]');
  const isReagent = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") || false;

  // Ensure "Reagent" option exists in the dropdown
  if (!typeSelect.find('option[value="reagent"]').length) {
    typeSelect.append('<option value="reagent">Reagent</option>');
  }

  // Set initial selection and sync with flag
  typeSelect.val(app.item.system.type.value);
  typeSelect.on("change", async (event) => {
    const value = event.target.value;
    const currentValue = app.item.system.type.value;
    await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent", value === "reagent");
    if (value !== currentValue) await app.item.update({ "system.type.value": value }); // Persist type only if changed
    else app.render(false); // Re-render without full reload
  });

  // Modify Loot Properties section if reagent
  if (isReagent) {
    const lootProperties = html.find(".form-group.stacked.checkbox-grid");
    if (lootProperties.length) {
      lootProperties.find("label").text("Reagent Properties");

      // Replace contents with labeled IP fields, essence with "Essence" label, centered text
      const ipValues = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
      const essence = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
      lootProperties.find(".form-fields").html(`
        <div style="text-align: center;">
          <label>Essence</label>
          <select name="flags.vikarovs-guide-to-kaeliduran-crafting.essence" style="width: 107.63px;">
            <option value="None" ${essence === "None" ? "selected" : ""}>None</option>
            <option value="Primal" ${essence === "Primal" ? "selected" : ""}>Primal</option>
            <option value="Fey" ${essence === "Fey" ? "selected" : ""}>Fey</option>
            <option value="Eldritch" ${essence === "Eldritch" ? "selected" : ""}>Eldritch</option>
          </select>
        </div>
        <div style="text-align: center;"><label>Combat</label><input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat" value="${ipValues.combat}" min="0"></div>
        <div style="text-align: center;"><label>Utility</label><input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility" value="${ipValues.utility}" min="0"></div>
        <div style="text-align: center;"><label>Entropy</label><input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy" value="${ipValues.entropy}" min="0"></div>
      `);

      // Sync changes to flags on submit
      html.find("form").on("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const updates = {
          "flags.vikarovs-guide-to-kaeliduran-crafting.isReagent": true,
          "flags.vikarovs-guide-to-kaeliduran-crafting.essence": formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.essence") || "None",
          "flags.vikarovs-guide-to-kaeliduran-crafting.ipValues": {
            combat: parseInt(formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat")) || 0,
            utility: parseInt(formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility")) || 0,
            entropy: parseInt(formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy")) || 0,
          }
        };
        await app.item.update(updates);
      });

      // Sync changes on close
      app.element.on("close", async () => {
        const formData = new FormData(html.find("form")[0]);
        const updates = {
          "flags.vikarovs-guide-to-kaeliduran-crafting.isReagent": true,
          "flags.vikarovs-guide-to-kaeliduran-crafting.essence": formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.essence") || "None",
          "flags.vikarovs-guide-to-kaeliduran-crafting.ipValues": {
            combat: parseInt(formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat")) || 0,
            utility: parseInt(formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility")) || 0,
            entropy: parseInt(formData.get("flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy")) || 0,
          }
        };
        await app.item.update(updates);
      });
    }
  }
});

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
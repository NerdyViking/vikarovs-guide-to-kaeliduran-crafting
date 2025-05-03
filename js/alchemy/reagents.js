console.log("reagents.js loaded");

Hooks.on("renderItemSheet5e", async (app, html, data) => {
  if (app.item.type !== "loot") return;

  const typeSelect = html.querySelector('select[name="system.type.value"]');
  if (!typeSelect) return;

  // Ensure "Reagent" option exists in the dropdown
  if (!typeSelect.querySelector('option[value="reagent"]')) {
    const option = document.createElement('option');
    option.value = "reagent";
    option.text = "Reagent";
    typeSelect.appendChild(option);
  }

  // Set initial selection and sync with flag
  const currentType = app.item.system.type?.value || "loot";
  typeSelect.value = currentType;

  const isReagent = currentType === "reagent";
  await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent", isReagent);

  typeSelect.addEventListener("change", async (event) => {
    const value = event.target.value;
    const isReagent = value === "reagent";
    await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent", isReagent);
    if (app.item.system.type?.value !== value) {
      await app.item.update({ "system.type.value": value });
    } else {
      app.render({ force: false });
    }
  });

  // Modify Loot Properties section if reagent
  if (isReagent) {
    const lootProperties = html.querySelector(".form-group.stacked.checkbox-grid");
    if (lootProperties) {
      const label = lootProperties.querySelector("label");
      if (label) label.textContent = "Reagent Properties";

      // Function to check locked state based on the mode-slider
      const checkLockedState = () => {
        const modeSlider = html.querySelector('.mode-slider');
        return modeSlider?.getAttribute("aria-label") === "Edit" || false;
      };

      // Initial locked state check (delayed to ensure DOM is fully rendered)
      let isLocked = false;
      await new Promise(resolve => setTimeout(() => {
        isLocked = checkLockedState();
        resolve();
      }, 0));

      const ipValues = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "ipValues") || { combat: 0, utility: 0, entropy: 0 };
      const essence = app.item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "essence") || "None";
      const formFields = lootProperties.querySelector(".form-fields");
      if (formFields) {
        formFields.innerHTML = `
          <div style="text-align: center;">
            <label>Essence</label>
            <select name="flags.vikarovs-guide-to-kaeliduran-crafting.essence" style="width: 107.63px;" ${isLocked ? "disabled" : ""}>
              <option value="None" ${essence === "None" ? "selected" : ""}>None</option>
              <option value="Primal" ${essence === "Primal" ? "selected" : ""}>Primal</option>
              <option value="Fey" ${essence === "Fey" ? "selected" : ""}>Fey</option>
              <option value="Eldritch" ${essence === "Eldritch" ? "selected" : ""}>Eldritch</option>
            </select>
          </div>
          <div style="text-align: center;"><label>Combat</label><input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat" value="${ipValues.combat}" min="0" ${isLocked ? "disabled" : ""}></div>
          <div style="text-align: center;"><label>Utility</label><input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility" value="${ipValues.utility}" min="0" ${isLocked ? "disabled" : ""}></div>
          <div style="text-align: center;"><label>Entropy</label><input type="number" name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy" value="${ipValues.entropy}" min="0" ${isLocked ? "disabled" : ""}></div>
        `;

        // Set up a MutationObserver to watch for changes to the mode-slider's aria-label
        const essenceSelect = formFields.querySelector('select[name="flags.vikarovs-guide-to-kaeliduran-crafting.essence"]');
        const combatInput = formFields.querySelector('input[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.combat"]');
        const utilityInput = formFields.querySelector('input[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.utility"]');
        const entropyInput = formFields.querySelector('input[name="flags.vikarovs-guide-to-kaeliduran-crafting.ipValues.entropy"]');

        const modeSlider = html.querySelector('.mode-slider');
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.attributeName === "aria-label") {
              const isNowLocked = modeSlider?.getAttribute("aria-label") === "Edit" || false;
              if (essenceSelect) essenceSelect.disabled = isNowLocked;
              if (combatInput) combatInput.disabled = isNowLocked;
              if (utilityInput) utilityInput.disabled = isNowLocked;
              if (entropyInput) entropyInput.disabled = isNowLocked;
            }
          });
        });

        // Observe changes to the aria-label attribute of the mode-slider
        if (modeSlider) {
          observer.observe(modeSlider, { attributes: true, attributeFilter: ["aria-label"] });
        }

        // Clean up the observer when the sheet closes
        app._element?.[0]?.addEventListener("close", () => {
          observer.disconnect();
        }, { once: true });
      }

      // Sync changes on close
      app._element?.[0]?.addEventListener("close", async () => {
        const form = app._element?.[0]?.querySelector("form");
        if (form) {
          const formData = new FormData(form);
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
        }
      }, { once: true });
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

export function isReagent(item) {
  return item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isReagent") === true;
}
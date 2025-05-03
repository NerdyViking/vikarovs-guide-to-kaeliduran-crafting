Hooks.on("renderItemSheet5e", async (app, html, data) => {
  if (app.item.type !== "loot") return;

  const typeSelect = html.querySelector('select[name="system.type.value"]');
  if (!typeSelect) return;

  if (!typeSelect.querySelector('option[value="component"]')) {
    const option = document.createElement('option');
    option.value = "component";
    option.text = "Component";
    typeSelect.appendChild(option);
  }

  const currentType = app.item.system.type?.value || "loot";
  typeSelect.value = currentType;

  const isComponent = currentType === "component";
  await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent", isComponent);

  typeSelect.addEventListener("change", async (event) => {
    const value = event.target.value;
    const isComponent = value === "component";
    await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent", isComponent);
    if (app.item.system.type?.value !== value) {
      await app.item.update({ "system.type.value": value });
    } else {
      app.render({ force: false });
    }
  });

  app._element?.[0]?.addEventListener("close", async () => {
    const form = app._element?.[0]?.querySelector("form");
    if (form) {
      const formData = new FormData(form);
      const typeValue = formData.get("system.type.value");
      const isComponent = typeValue === "component";
      await app.item.setFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent", isComponent);
    }
  }, { once: true });
});

export function isComponent(item) {
  return item.getFlag("vikarovs-guide-to-kaeliduran-crafting", "isComponent") === true;
}
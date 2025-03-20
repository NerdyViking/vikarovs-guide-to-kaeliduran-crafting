// js/workshop/componentSelector.js
console.log("componentSelector.js loaded");

export class ComponentSelectorApplication extends Application {
  constructor(actor, callback, options = {}) {
    super(options);
    this._actor = actor;
    this.callback = callback; // Callback to handle component selection
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "vikarovs-component-selector",
      title: "Select a Component",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/componentSelectorDialog.hbs",
      width: 400,
      height: 'auto',
      classes: ["vikarovs-workshop-interface", "vikarovs-component-selector"],
      resizable: false
    });
  }

  async getData() {
    const components = this._actor.items
      .filter(item => item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent'))
      .map(item => ({
        uuid: item.uuid,
        name: item.name,
        img: item.img || '/icons/svg/mystery-man.svg',
        quantity: item.system.quantity || 1
      }));
    return { components };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.vikarovs-component-item').on('click', async (event) => {
      const uuid = $(event.currentTarget).data('uuid');
      let item;
      try {
        item = await fromUuid(uuid);
        if (!item) throw new Error("Item not found.");
      } catch (e) {
        console.error("Failed to fetch component with UUID:", uuid, e);
        ui.notifications.error("Failed to select component.");
        return;
      }

      const componentName = item.name.replace(/\(Copy\)/g, '').trim();
      console.log("Selected component name:", componentName);

      // Call the callback with the selected component data
      if (this.callback) {
        this.callback({ uuid, name: componentName, img: item.img });
      }

      // Close the application
      this.close();
    });
  }
}
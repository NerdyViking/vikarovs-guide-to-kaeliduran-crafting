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
      height: 600,
      classes: ["vikarovs-workshop-interface", "vikarovs-component-selector"],
      resizable: false
    });
  }

  async getData() {
    const data = await super.getData();
    if (!this._actor) {
      console.error("ComponentSelectorApplication: No actor provided.");
      data.components = [];
      return data;
    }

    // Filter the actor's inventory for components
    const components = this._actor.items
      .filter(item => item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent'))
      .map(item => ({
        uuid: item.uuid,
        name: item.name,
        img: item.img || 'icons/svg/mystery-man.svg',
        quantity: item.system.quantity || 1
      }));
    data.components = components;
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Prevent dragging on the content area to avoid interference
    const contentArea = html.find('.vikarovs-dialog-content');
    contentArea.on('mousedown', (event) => {
      event.stopPropagation(); // Prevent the mousedown from triggering window dragging
    });

    // Bind click handler using vanilla JS with a slight delay to ensure DOM rendering
    setTimeout(() => {
      const listItems = html[0].querySelectorAll('.vikarovs-component-item');
      listItems.forEach(item => {
        // Remove any existing click listeners to prevent duplicates
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);

        newItem.addEventListener('click', async (event) => {
          event.stopPropagation(); // Prevent the click from bubbling up to parent handlers
          const uuid = newItem.dataset.uuid;
          if (!uuid) {
            ui.notifications.error("Failed to select component: No UUID found.");
            return;
          }

          let selectedItem;
          try {
            selectedItem = await fromUuid(uuid);
            if (!selectedItem) throw new Error("Item not found.");
          } catch (e) {
            console.error("Failed to fetch component with UUID:", uuid, e);
            ui.notifications.error("Failed to select component.");
            return;
          }

          // Call the callback with the selected component data
          if (this.callback) {
            const componentData = {
              uuid: selectedItem.uuid,
              name: selectedItem.name,
              img: selectedItem.img || 'icons/svg/mystery-man.svg'
            };
            this.callback(componentData);
          } else {
            console.warn("No callback provided to ComponentSelectorApplication.");
          }

          // Close the application
          this.close();
        });
      });
    }, 100); // Small delay to ensure DOM is fully rendered
  }
}
export class RuneDrawer extends Application {
    constructor(workshopInterface, options = {}) {
      super(options);
      this.workshopInterface = workshopInterface;
      this.actor = workshopInterface._actor;
    }
  
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "rune-drawer",
        title: "Runes",
        template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/runeDrawer.hbs",
        width: 250,
        height: 800, // Match the WorkshopInterface height
        resizable: false,
        popOut: true,
        classes: ["rune-drawer"],
        dragDrop: [],
        minimizable: false,
        tabs: []
      });
    }
  
    async getData() {
      const data = await super.getData();
      data.isOpen = this.workshopInterface.isEssenceWorkshop;
      return data;
    }
  
    activateListeners(html) {
      super.activateListeners(html);
      // Add any rune-specific listeners here in the next step
    }
  
    // Override _render to position the drawer next to the WorkshopInterface
    async _render(force = false, options = {}) {
      await super._render(force, options);
  
      // Position the drawer to the right of the WorkshopInterface
      const workshopPos = this.workshopInterface.position;
      const workshopEl = this.workshopInterface.element[0];
      const workshopWidth = workshopEl.offsetWidth;
      const workshopHeight = workshopEl.offsetHeight;
  
      // Set the drawer's position
      this.setPosition({
        left: workshopPos.left + workshopWidth,
        top: workshopPos.top,
        height: workshopHeight
      });
  
      // Add a listener to move the drawer when the WorkshopInterface is dragged
      this.workshopInterface.element.off("dragend.runeDrawer");
      this.workshopInterface.element.on("dragend.runeDrawer", () => {
        const newPos = this.workshopInterface.position;
        this.setPosition({
          left: newPos.left + workshopWidth,
          top: newPos.top
        });
      });
  
      // Add a listener to close the drawer when the WorkshopInterface closes
      this.workshopInterface.element.off("close.runeDrawer");
      this.workshopInterface.element.one("close.runeDrawer", () => {
        this.close();
      });
  
      return this;
    }
  }
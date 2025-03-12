// js/alchemy/reagentSelectionDialog.js
export class ReagentSelectionDialog extends Application {
    constructor(actor, slotIndex, cauldronSlots, alchemyInterface, options = {}) {
      super(options);
      this._actor = actor;
      this.slotIndex = slotIndex;
      this.cauldronSlots = cauldronSlots;
      this.alchemyInterface = alchemyInterface;
    }
  
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "reagent-selection-dialog",
        title: "Select Reagent",
        template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/reagentSelectionDialog.hbs",
        width: 600, // Fixed width
        height: 500, // Fixed height
        classes: ["alchemy-interface", "reagent-selection"],
        resizable: false // Disable resizing to enforce fixed size
      });
    }
  
    async getData() {
      const slottedItemIds = Object.values(this.cauldronSlots).filter(id => id !== null);
  
      // Filter reagents from actor's inventory
      const reagents = this._actor.items.filter(item => {
        return item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') === true &&
               !slottedItemIds.includes(item.id) && item.type === "loot";
      });
  
      // Prepare reagent data with metadata
      const reagentList = reagents.map(item => {
        const ipValues = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
        const rarity = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'essence') || "None";
        const metadata = `[${rarity}] (C:${ipValues.combat} U:${ipValues.utility} E:${ipValues.entropy})`;
        return {
          id: item.id,
          img: item.img,
          name: item.name,
          metadata: metadata
        };
      });
  
      return {
        reagents: reagentList,
        slotIndex: this.slotIndex
      };
    }
  
    activateListeners(html) {
      const $html = $(html);
  
      // Handle reagent selection
      $html.find('.reagent-option').on('click', async (event) => {
        const itemId = $(event.currentTarget).data('item-id');
        const slots = foundry.utils.deepClone(this.cauldronSlots);
        slots[this.slotIndex] = itemId;
  
        await this._actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'cauldronSlots', slots);
        this.alchemyInterface.render();
        this.close();
      });
  
      // Handle close button
      $html.find('.close-btn').on('click', () => this.close());
    }
  
    _getHeaderButtons() {
      return [
        {
          label: "Close",
          class: "close-btn",
          icon: "fas fa-times",
          onclick: () => this.close()
        }
      ];
    }
  }
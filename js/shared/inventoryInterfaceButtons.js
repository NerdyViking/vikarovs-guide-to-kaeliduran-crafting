// js/shared/inventoryInterfaceButtons.js
import { AlchemyInterface } from "../alchemy/alchemyInterface.js";
import { VikarovsWorkshopInterface } from "../workshop/workshopInterface.js"; // Update import

// Function to inject buttons into a new div before .middle
function injectButtons(app, html) {
  // Target the <dnd5e-inventory class="inventory-element"> container
  const inventoryElement = html.find('dnd5e-inventory.inventory-element');
  if (inventoryElement.length === 0) {
    console.warn("Inventory element not found");
    return false;
  }

  // Target the .middle div within the inventory element
  const middleSection = inventoryElement.find('.middle');
  if (middleSection.length === 0) {
    console.warn("Middle section not found within inventory element");
    return false;
  }

  // Check if the crafting-controls div already exists to avoid duplication
  let craftingControls = inventoryElement.find('.crafting-controls');
  if (craftingControls.length === 0) {
    // Create and insert the new div for crafting controls before .middle
    craftingControls = $('<div class="crafting-controls"></div>');
    middleSection.before(craftingControls);

    // Re-query the DOM to ensure we have the inserted element
    craftingControls = inventoryElement.find('.crafting-controls');
    if (craftingControls.length === 0) {
      console.warn("Crafting-controls div not found in DOM after insertion");
      return false;
    }

    // Add buttons with tooltips
    craftingControls.append(
      `<button class="cauldron-btn" title="Cauldron: Open the Alchemy Interface to craft potions and bombs">Cauldron</button>`
    );
    craftingControls.append(
      `<button class="workshop-btn" title="Workshop: Open the Workshop to craft magical items">Workshop</button>`
    );

    // Bind click events
    craftingControls.find('.cauldron-btn').on('click', () => {
      const actor = app.actor;
      new AlchemyInterface(actor).render(true);
    });

    craftingControls.find('.workshop-btn').on('click', () => {
      const actor = app.actor;
      new VikarovsWorkshopInterface(actor).render(true);
    });

    return true;
  }
  return false;
}

// Function to setup the MutationObserver and handle button injection
function setupInventoryButtons(app, html) {
  // Check if the actor is a PC and the sheet is the default 5e PC sheet
  if (app.actor.type !== "character" || !(app instanceof dnd5e.applications.actor.ActorSheet5eCharacter)) {
    return;
  }

  // Target the .sheet-body (parent of all tab content)
  const sheetBody = html.find('.sheet-body');
  if (sheetBody.length === 0) {
    console.warn("Sheet body not found");
    return;
  }

  // Attempt immediate injection if inventory tab is present
  if (injectButtons(app, html)) {
    return;
  }

  // Set up MutationObserver to inject buttons when the inventory tab is added
  const tabObserver = new MutationObserver((mutations, observer) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const inventoryTab = html.find('.tab.inventory');
        if (inventoryTab.length > 0) {
          if (injectButtons(app, html)) {
            observer.disconnect(); // Stop observing once buttons are injected
            break;
          }
        }
      }
    }
  });

  tabObserver.observe(sheetBody[0], {
    childList: true,
    subtree: true
  });

  // Clean up the tab observer when the sheet is closed
  app._observers = app._observers || [];
  app._observers.push(tabObserver);
  app._element.on('close', () => {
    tabObserver.disconnect();
  });

  // Set up MutationObserver to handle re-rendering of <dnd5e-inventory>
  const inventoryElement = html.find('dnd5e-inventory.inventory-element');
  if (inventoryElement.length > 0) {
    const reRenderObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const craftingControls = inventoryElement.find('.crafting-controls');
        if (craftingControls.length > 0 && craftingControls.children().length === 0) {
          injectButtons(app, html); // Re-inject buttons if they are removed
        }
      }
    });

    reRenderObserver.observe(inventoryElement[0], {
      childList: true,
      subtree: true
    });

    // Clean up the re-render observer when the sheet is closed
    app._observers.push(reRenderObserver);
  }
}

// Hook into renderActorSheet to initialize button setup
Hooks.on("renderActorSheet", (app, html, data) => {
  setupInventoryButtons(app, html);
});

export { setupInventoryButtons };
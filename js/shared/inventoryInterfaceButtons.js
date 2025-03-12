// js/shared/inventoryInterfaceButtons.js

import { AlchemyInterface } from "../alchemy/alchemyInterface.js";

function injectButtons(app, html) {
  const inventoryElement = html.find('dnd5e-inventory.inventory-element');
  if (inventoryElement.length === 0) {
    console.warn("Inventory element not found");
    return false;
  }

  const middleSection = inventoryElement.find('.middle');
  if (middleSection.length === 0) {
    console.warn("Middle section not found within inventory element");
    return false;
  }

  let craftingControls = inventoryElement.find('.crafting-controls');
  if (craftingControls.length === 0) {
    craftingControls = $('<div class="crafting-controls"></div>');
    middleSection.before(craftingControls);

    craftingControls = inventoryElement.find('.crafting-controls');
    if (craftingControls.length === 0) {
      console.warn("Crafting-controls div not found in DOM after insertion");
      return false;
    }

    craftingControls.append(
      `<button class="cauldron-btn" title="Cauldron: Open the Alchemy Interface to craft potions and bombs">Cauldron</button>`
    );
    craftingControls.append(
      `<button class="workshop-btn" title="Workshop: Open the Workshop to craft magical items (Coming Soon)">Workshop</button>`
    );

    craftingControls.find('.cauldron-btn').on('click', () => {
      const actor = app.actor;
      if (actor) new AlchemyInterface(actor).render(true);
      else console.error("No actor available for Cauldron button");
    });

    craftingControls.find('.workshop-btn').on('click', () => {
      new foundry.applications.Dialog({
        title: "Workshop",
        content: "<p>Workshop Coming Soon!</p>",
        buttons: { close: { label: "Close" } }
      }).render(true);
    });

    return true;
  }
  return false;
}

// Function to append reagent metadata to the .tags div
function injectReagentMetadataToTags(app, html) {
  const actor = app.actor;
  if (!actor) {
    console.warn("No actor available to inject reagent metadata into tags");
    return;
  }

  // Target all inventory list items
  const itemElements = html.find('.item-list .item');
  itemElements.each((index, element) => {
    const $element = $(element);
    const itemId = $element.data('item-id');
    const item = actor.items.get(itemId);

    if (!item) return;

    // Check if the item is a reagent
    const isReagent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isReagent') === true && item.type === "loot";
    if (!isReagent) return;

    // Generate metadata
    const ipValues = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'ipValues') || { combat: 0, utility: 0, entropy: 0 };
    const essence = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'essence') || "None";
    const metadata = `[${essence}] (C:${ipValues.combat} U:${ipValues.utility} E:${ipValues.entropy})`;

    // Find the .tags div for this item
    const $tags = $element.find('.item-name .tags');
    if ($tags.length) {
      // Check if metadata already exists to avoid duplication
      if (!$tags.find('.reagent-metadata').length) {
        $tags.append(`<span class="tag reagent-metadata">${metadata}</span>`);
        console.debug(`Added metadata to tags for ${item.name}: ${metadata}`);
      }
    } else {
      console.debug(`No .tags div found for ${item.name}`);
    }
  });
}

function setupInventoryButtons(app, html, data) {
  const sheetBody = html.find('.sheet-body');
  if (sheetBody.length === 0) {
    console.warn("Sheet body not found");
    return;
  }

  // Inject buttons immediately if inventory tab is present
  if (injectButtons(app, html)) {
    injectReagentMetadataToTags(app, html); // Inject metadata into tags
    return;
  }

  const tabObserver = new MutationObserver((mutations, observer) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const inventoryTab = html.find('.tab.inventory');
        if (inventoryTab.length > 0) {
          if (injectButtons(app, html)) {
            injectReagentMetadataToTags(app, html); // Inject metadata into tags
            observer.disconnect();
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

  app._observers = app._observers || [];
  app._observers.push(tabObserver);
  app._element.on('close', () => {
    tabObserver.disconnect();
  });

  const inventoryElement = html.find('dnd5e-inventory.inventory-element');
  if (inventoryElement.length > 0) {
    const reRenderObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const craftingControls = inventoryElement.find('.crafting-controls');
        if (craftingControls.length > 0 && craftingControls.children().length === 0) {
          injectButtons(app, html);
          injectReagentMetadataToTags(app, html); // Re-inject metadata into tags on re-render
        }
      }
    });

    reRenderObserver.observe(inventoryElement[0], {
      childList: true,
      subtree: true
    });

    app._observers.push(reRenderObserver);
  }

  // Initial metadata injection if inventory is already loaded
  injectReagentMetadataToTags(app, html);
}

Hooks.on("renderActorSheet", (app, html, data) => {
  setupInventoryButtons(app, html, data);
});

export { setupInventoryButtons };
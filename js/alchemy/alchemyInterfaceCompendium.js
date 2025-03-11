// js/alchemy/alchemyInterfaceCompendium.js
export function handleCompendiumListeners(alchemyInterface, html) {
  const editMode = alchemyInterface.editMode;
  const actor = alchemyInterface._actor;

  html.find('.consumable-link').on("click", (event) => {
    if (editMode) return;
    const itemId = event.currentTarget.dataset.itemId;
    const item = game.items.get(itemId) || actor.items.get(itemId) || (itemId ? fromUuidSync(itemId) : null);
    if (item) item.sheet.render(true);
    else ui.notifications.error("Item not found.");
  });

  html.find('.consumable-link').on("mouseenter", async (event) => {
    const $target = $(event.currentTarget);
    const itemId = $target.data('itemId');
    const isUnknown = $target.hasClass('unknown-icon');

    // Only show tooltip if the outcome is known (not unknown)
    if (!isUnknown && itemId) {
      const item = game.items.get(itemId) || actor.items.get(itemId) || (itemId ? await fromUuid(itemId) : null);
      let tooltipContent = '';

      if (item) {
        const name = item.name || "Unknown Item";
        const description = item.system?.description?.value ? item.system.description.value.replace(/<[^>]+>/g, ' ').trim() : "";
        tooltipContent = `<h4>${name}</h4>${description ? `<div>${description}</div>` : ""}`;
      } else {
        tooltipContent = `<h4>Unknown Item</h4>`;
      }

      let tooltip = $(".custom-tooltip");
      if (!tooltip.length) tooltip = $('<div class="custom-tooltip"></div>').appendTo(document.body);
      tooltip.empty().html(tooltipContent).css({
        position: 'absolute',
        background: '#1c2526',
        border: '1px solid #4b4a44',
        padding: '5px',
        borderRadius: '3px',
        color: '#f0f0e0',
        zIndex: 10001,
        display: 'block',
        pointerEvents: 'none',
        top: event.pageY + 5 + 'px',
        left: event.pageX + 5 + 'px'
      });
      const contentHeight = tooltip.outerHeight();
      tooltip.css('width', (contentHeight * 4) + 'px');
    }
  }).on("mouseleave", () => {
    $(".custom-tooltip").remove();
  });

  if (editMode && game.user.isGM) {
    html.find('.clear-outcome').on("click", async (event) => {
      const sum = event.currentTarget.dataset.sum;
      const category = event.currentTarget.dataset.category;
      const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
      delete outcomes[category][sum];
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
      alchemyInterface.render();
    });

    html.find('.outcome-cell').on('drop', async (event) => {
      event.preventDefault();
      try {
        const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
        if (data.type !== 'Item') {
          ui.notifications.warn("Only items can be dropped here.");
          return;
        }
        let item = await fromUuid(data.uuid);
        if (!item) {
          item = game.items.get(data.id) || actor.items.get(data.id);
          if (!item) {
            ui.notifications.error("Failed to resolve dropped item.");
            return;
          }
        }
        const sum = event.currentTarget.dataset.sum;
        const category = event.currentTarget.dataset.category;
        const outcomes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes'));
        outcomes[category][sum] = data.uuid; // Store full UUID
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes', outcomes);
        alchemyInterface.render();
      } catch (error) {
        ui.notifications.error("Failed to link item to outcome: " + error.message);
      }
    });
  }
}

export async function prepareCompendiumData(actor, editMode, craftingMemory) {
  const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
  const rarityRanges = {
    common: { start: 1, end: 12 },
    uncommon: { start: 13, end: 21 },
    rare: { start: 22, end: 27 },
    veryRare: { start: 28, end: 30 },
    legendary: { start: 31, end: 31 }
  };

  const tabs = {
    combat: { rarityGroups: {} },
    utility: { rarityGroups: {} },
    entropy: { rarityGroups: {} }
  };

  for (const category of ["Combat", "Utility", "Entropy"]) {
    for (const [rarity, range] of Object.entries(rarityRanges)) {
      const outcomesData = {};
      for (let sum = range.start; sum <= range.end; sum++) {
        const itemUuid = outcomes[category][sum] || null;
        let itemImg = 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png';
        let isUnknown = true;
        let itemId = null;

        // Fetch item using UUID if available
        if (itemUuid) {
          const item = await fromUuid(itemUuid);
          if (item) {
            itemId = item.id; // Store raw ID for rendering
            if (editMode || (craftingMemory[category] && craftingMemory[category].includes(sum))) {
              itemImg = item.img;
              isUnknown = false;
            }
          }
        }

        outcomesData[sum] = { itemId, itemImg, isUnknown };
      }
      tabs[category.toLowerCase()].rarityGroups[rarity] = { outcomes: outcomesData };
    }
  }

  return { tabs };
}

// Helper function to get Compendium item
export function getCompendiumItem(category, sum) {
  const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
  const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
  return outcomes[capitalizedCategory]?.[sum] || null;
}

// Helper function to highlight the outcome
export function highlightOutcome(category, sum, html) {
  const $outcomeCell = html.find(`.outcome-cell[data-category="${category.charAt(0).toUpperCase() + category.slice(1)}"][data-sum="${sum}"] .outcome-icon`);
  console.log(`Highlighting outcome for category: ${category}, sum: ${sum}, found elements: ${$outcomeCell.length}`);
  if ($outcomeCell.length) {
    $outcomeCell.addClass('highlight-outcome').closest('.outcome-cell').siblings().find('.outcome-icon').removeClass('highlight-outcome');
  } else {
    console.warn(`No outcome-icon found for category: ${category}, sum: ${sum}`);
  }
}
export async function prepareCompendiumData(actor, editMode, craftingMemory) {
  const tabs = {};
  const categories = ["combat", "utility", "entropy"];
  const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
  const rarityRanges = {
    common: { start: 1, end: 12 },
    uncommon: { start: 13, end: 21 },
    rare: { start: 22, end: 27 },
    veryRare: { start: 28, end: 30 },
    legendary: { start: 31, end: 31 }
  };

  for (const category of categories) {
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    const categoryOutcomes = outcomes[capitalizedCategory] || {};
    const knownSums = craftingMemory[capitalizedCategory] || [];

    const sumsByRarity = { common: {}, uncommon: {}, rare: {}, veryRare: {}, legendary: {} };

    // Generate slots for all sums within rarity ranges
    for (const [rarity, range] of Object.entries(rarityRanges)) {
      for (let sum = range.start; sum <= range.end; sum++) {
        const itemUuid = categoryOutcomes[sum] || null;
        let itemImg = 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png';
        let isUnknown = true;
        let itemId = null;
        let hasItem = false;

        if (itemUuid) {
          const item = await fromUuid(itemUuid);
          if (item) {
            itemId = item.id;
            if (editMode || knownSums.includes(sum)) {
              itemImg = item.img;
              isUnknown = false;
              hasItem = true;
            }
          }
        }

        const outcomeData = {
          sum,
          itemId,
          itemImg,
          isUnknown,
          hasItem
        };
        sumsByRarity[rarity][sum] = outcomeData;
      }
    }

    tabs[category] = {
      rarityGroups: {
        common: { outcomes: sumsByRarity.common },
        uncommon: { outcomes: sumsByRarity.uncommon },
        rare: { outcomes: sumsByRarity.rare },
        veryRare: { outcomes: sumsByRarity.veryRare },
        legendary: { outcomes: sumsByRarity.legendary }
      }
    };
  }

  return { tabs };
}

export function highlightOutcome(category, sum, html) {
  const $outcomes = html.find('.outcome-icon');
  $outcomes.each((_, element) => {
    const $element = $(element);
    const elementCategory = $element.data('category')?.toLowerCase();
    const elementSum = parseInt($element.data('sum'));
    if (elementCategory === category && elementSum === sum) {
      $element.addClass('highlight');
    } else {
      $element.removeClass('highlight');
    }
  });
}

export function getCompendiumItem(category, sum) {
  const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
  const outcomes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'consumableOutcomes');
  return outcomes[capitalizedCategory]?.[sum] || null;
}

export function handleCompendiumListeners(alchemyInterface, html) {
  const editMode = alchemyInterface.editMode;
  const actor = alchemyInterface._actor;

  // Handle clicking on consumable links to open item sheets
  html.find('.consumable-link').on("click", async (event) => {
    if (editMode) return;
    const itemId = event.currentTarget.dataset.itemId;
    const item = game.items.get(itemId) || actor.items.get(itemId) || (itemId ? await fromUuid(itemId) : null);
    if (item) {
      await alchemyInterface._renderItemSheet(item);
    } else {
      ui.notifications.error("Item not found.");
    }
  });

  // Handle tooltip on hover for known outcomes
  html.find('.consumable-link').on("mouseenter", async (event) => {
    const $target = $(event.currentTarget);
    const itemId = $target.data('itemId');

    if (itemId) {
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
}
import { isComponent } from '../shared/utils.js';

export function handleRecipeBookListeners(workshopInterface, html) {
    html.querySelectorAll('.drop-zone').forEach(element => {
      element.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      });
  
      element.addEventListener('drop', async (event) => {
        event.preventDefault();
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (!data.type || !data.uuid) {
          ui.notifications.warn("Invalid item data.");
          return;
        }
  
        const item = await fromUuid(data.uuid);
        if (!item) {
          ui.notifications.warn("Item not found.");
          return;
        }
  
        const type = element.dataset.type;
        const index = element.dataset.index;
  
        if (type === 'component' && !isComponent(item)) {
          ui.notifications.warn("Only components can be dropped here.");
          return;
        }
  
        if (type === 'tool' && item.type !== 'tool') {
          ui.notifications.warn("Only tools can be dropped here.");
          return;
        }
  
        if (type === 'component' || type === 'outcome' || type === 'tool') {
          element.innerHTML = `
            <img src="${item.img}" alt="${item.name}" class="slot-image" data-uuid="${item.uuid}" />
            <span class="slot-name">${item.name}</span>
          `;
        }
  
        ui.notifications.info(`Dropped ${item.name} (${type}${index !== undefined ? ` ${index}` : ''})`);
      });
    });
  }
  
  export function handleRecipeBookSlotInteractions(workshopInterface, html) {
    if (!(html instanceof HTMLElement)) return;
  
    html.querySelectorAll('.component-slot, .outcome-slot, .tool-slot').forEach(slot => {
      slot.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
  
        const img = event.target.closest('.component-image, .outcome-image, .tool-image');
        if (!img) return;
  
        const uuid = img.dataset.uuid;
        if (!uuid) return;
  
        if (event.shiftKey) {
          fromUuid(uuid).then(item => {
            if (item) {
              item.sheet.render(true);
            }
          }).catch(err => {
            console.error(`Error fetching item with UUID ${uuid}:`, err);
          });
        } else if (slot.classList.contains('outcome-slot')) {
          const index = parseInt(slot.dataset.index);
          if (typeof index === 'number') {
            workshopInterface.selectedOutcomeIndex = index;
  
            // Fetch recipes and find the selected recipe
            const { getRecipes } = await import('./workshopCompendium.js');
            const recipes = await getRecipes();
            const selectedRecipe = workshopInterface.selectedRecipeId
              ? recipes.find(recipe => recipe.id === workshopInterface.selectedRecipeId)
              : null;
  
            // Calculate DC and costs for display
            if (selectedRecipe) {
              const component = await fromUuid(selectedRecipe.componentUuid);
              if (component) {
                const { dc, basePrice } = await getDCCraftEnchant(component);
                workshopInterface.dc = dc;
                workshopInterface.goldCostCraft = basePrice;
                workshopInterface.goldCostEnchant = basePrice * 1.5;
              } else {
                // Reset values if component is not found
                workshopInterface.dc = null;
                workshopInterface.goldCostCraft = null;
                workshopInterface.goldCostEnchant = null;
              }
            } else {
              // Reset values if no recipe is selected
              workshopInterface.dc = null;
              workshopInterface.representation = null;
              workshopInterface.goldCostEnchant = null;
            }
  
            workshopInterface.render({ force: true });
          }
        }
      });
    });
  }
  
  async function getDCCraftEnchant(component) {
    const rarity = component?.system?.rarity || 'common';
    const rarityMap = {
      common: { dc: 10, basePrice: 100 },
      uncommon: { dc: 15, basePrice: 400 },
      rare: { dc: 20, basePrice: 4000 },
      veryRare: { dc: 25, basePrice: 40000 },
      legendary: { dc: 30, basePrice: 200000 }
    };
    return rarityMap[rarity.toLowerCase()] || { dc: 10, basePrice: 100 };
  }
  
  async function consumeResources(actor, componentUuid, componentName, goldCost) {
    const itemId = componentUuid.split('.').pop();
    let component = actor.items.find(item => item.id === itemId);
    if (!component) {
      component = actor.items.find(item => item.name === componentName);
    }
    if (!component) {
      ui.notifications.warn("Component not found in actor's inventory.");
      return false;
    }
  
    const quantity = component.system.quantity || 1;
    if (quantity > 1) {
      await component.update({ 'system.quantity': quantity - 1 });
    } else {
      await component.delete();
    }
  
    const currentGold = actor.system.currency?.gp || 0;
    await actor.update({ 'system.currency.gp': Math.max(0, currentGold - goldCost) });
    return true;
  }
  
  async function createCraftedItem(actor, outcome, margin, basePrice) {
    let qualityPrefix = '';
    let priceMultiplier = 1;
    let flavorText = "Crafted with competence, this item serves its purpose reliably.";
  
    if (margin >= 10) {
      qualityPrefix = "Masterwork ";
      priceMultiplier = 4;
      flavorText = "Expertly crafted, this item is a masterpiece of artisanship.";
    } else if (margin >= 0) {
      qualityPrefix = '';
      priceMultiplier = 1;
      flavorText = "Crafted with competence, this item serves its purpose reliably.";
    } else if (margin >= -9) {
      qualityPrefix = "Shoddy ";
      priceMultiplier = 0.5;
      flavorText = "Crafted with some flaws, this item bears visible imperfections.";
    } else {
      qualityPrefix = "Patchwork ";
      priceMultiplier = 0;
      flavorText = "Hastily assembled, this item is a chaotic patchwork of materials.";
    }
  
    const finalName = `${qualityPrefix}${outcome.name}`;
    const finalPrice = basePrice * priceMultiplier;
    const description = `Crafted item from ${outcome.name}. ${flavorText}`;
  
    let existingItem = actor.items.find(item => item.name === finalName && item.type === 'loot');
  
    if (existingItem) {
      const currentQuantity = existingItem.system.quantity || 1;
      await existingItem.update({ 'system.quantity': currentQuantity + 1 });
      return existingItem;
    } else {
      const itemData = {
        name: finalName,
        type: 'loot',
        img: outcome.img,
        system: {
          description: { value: description },
          quantity: 1,
          price: { value: finalPrice, denomination: 'gp' }
        },
        flags: {
          'vikarovs-guide-to-kaeliduran-crafting': {
            margin: margin
          }
        }
      };
      const [newItem] = await actor.createEmbeddedDocuments('Item', [itemData]);
      return newItem;
    }
  }
  
  async function createChatCard(actor, action, recipe, outcome, component, roll, margin, dc) {
    let qualityPrefix = '';
    if (margin >= 10) {
      qualityPrefix = "Masterwork ";
    } else if (margin >= 0) {
      qualityPrefix = '';
    } else if (margin >= -9) {
      qualityPrefix = "Shoddy ";
    } else {
      qualityPrefix = "Patchwork ";
    }
    const finalName = `${qualityPrefix}${outcome.name}`;
  
    const content = `
      <div>
        <h3>${action} Result</h3>
        <p><strong>Actor:</strong> ${actor.name}</p>
        <p><strong>Recipe:</strong> ${recipe.name}</p>
        <p><strong>Outcome:</strong> ${finalName}</p>
        <p><strong>Component:</strong> ${component.name}</p>
        <p><strong>DC:</strong> ${dc}</p>
        <p><strong>Roll:</strong> ${roll.total} (${margin >= 0 ? 'Success' : 'Failure'} by ${Math.abs(margin)})</p>
        <p><strong>Item Created:</strong> ${finalName}</p>
      </div>
    `;
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      type: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }
  
  export async function performCrafting(workshopInterface, context) {
    const { selectedOutcomeIndex, selectedCharacterId } = workshopInterface;
    const selectedRecipe = context.selectedRecipe;
  
    if (!selectedRecipe || selectedOutcomeIndex == null || !selectedCharacterId) {
      ui.notifications.warn("Missing required data for crafting: recipe, outcome, or character.");
      return;
    }
  
    const actor = game.actors.get(selectedCharacterId);
    if (!actor) {
      ui.notifications.warn("Selected character not found.");
      return;
    }
  
    const component = await fromUuid(selectedRecipe.componentUuid);
    const outcome = selectedRecipe.outcomes[selectedOutcomeIndex];
    const tool = selectedRecipe.tools[selectedOutcomeIndex];
  
    if (!actor || !component || !outcome || !tool) {
      ui.notifications.warn("Missing required data for crafting: actor, component, outcome, or tool.");
      return;
    }
  
    if (!component.system.quantity || component.system.quantity < 1) {
      ui.notifications.warn("No components available.");
      return;
    }
  
    const goldCost = component.system.price?.value || 0;
    if ((actor.system.currency?.gp || 0) < goldCost) {
      ui.notifications.warn("Not enough gold to craft.");
      return;
    }
  
    const requiredToolType = selectedRecipe.toolTypes?.[selectedOutcomeIndex];
    const toolItem = actor.itemTypes.tool.find(item => {
      const baseItem = item.system?.type?.baseItem;
      const normalizedBaseItem = baseItem?.replace('calligraphers-su', 'calligrapher') || baseItem;
      return normalizedBaseItem === requiredToolType;
    });
  
    if (!toolItem) {
      ui.notifications.warn("Required tool not found in inventory.");
      return;
    }
  
    const { dc, basePrice } = await getDCCraftEnchant(component);
    await toolItem.rollToolCheck({ async: true });
  
    await new Promise(resolve => setTimeout(resolve, 500));
    const latestMessages = game.messages.filter(msg => msg.speaker.actor === actor.id && msg.rolls.length > 0).slice(-1);
    const rollMessage = latestMessages[0];
    if (!rollMessage || !rollMessage.rolls || rollMessage.rolls.length === 0) {
      ui.notifications.warn("Failed to retrieve tool roll result from chat.");
      return;
    }
  
    const roll = rollMessage.rolls[0];
    if (!roll || typeof roll.total !== 'number') {
      ui.notifications.warn("Failed to retrieve tool roll result.");
      return;
    }
  
    const margin = roll.total - dc;
    const consumed = await consumeResources(actor, selectedRecipe.componentUuid, component.name, goldCost);
    if (!consumed) {
      return;
    }
    const itemData = await createCraftedItem(actor, outcome, margin, basePrice);
    await createChatCard(actor, "Crafting", selectedRecipe, outcome, component, roll, margin, dc);
  }
  
  export async function performEnchanting(workshopInterface, context) {
    const { selectedOutcomeIndex, selectedCharacterId } = workshopInterface;
    const selectedRecipe = context.selectedRecipe;
  
    if (!selectedRecipe || selectedOutcomeIndex == null || !selectedCharacterId) {
      ui.notifications.warn("Missing required data for enchanting: recipe, outcome, or character.");
      return;
    }
  
    const actor = game.actors.get(selectedCharacterId);
    if (!actor) {
      ui.notifications.warn("Selected character not found.");
      return;
    }
  
    await actor.getEmbeddedCollection('Item');
  
    const component = await fromUuid(selectedRecipe.componentUuid);
    const outcome = selectedRecipe.outcomes[selectedOutcomeIndex];
  
    if (!actor || !component || !outcome) {
      ui.notifications.warn("Missing required data for enchanting: actor, component, or outcome.");
      return;
    }
  
    if (!component.system.quantity || component.system.quantity < 1) {
      ui.notifications.warn("No components available.");
      return;
    }
  
    const goldCost = (component.system.price?.value || 0) * 1.5;
    if ((actor.system.currency?.gp || 0) < goldCost) {
      ui.notifications.warn("Not enough gold to enchant.");
      return;
    }
  
    const { dc, basePrice } = await getDCCraftEnchant(component);
  
    if (actor.type !== 'character') {
      ui.notifications.warn("Enchanting requires a character actor.");
      return;
    }
  
    let roll;
    try {
      await actor.rollSkill({ skill: 'arc' }, { configure: true }, { rollMode: 'public' });
  
      await new Promise(resolve => setTimeout(resolve, 500));
      const latestMessages = game.messages.filter(msg => msg.speaker.actor === actor.id && msg.rolls.length > 0).slice(-1);
      const rollMessage = latestMessages[0];
      if (!rollMessage || !rollMessage.rolls || rollMessage.rolls.length === 0) {
        ui.notifications.warn("Failed to retrieve Arcana check result from chat.");
        return;
      }
  
      roll = rollMessage.rolls[0];
    } catch (err) {
      ui.notifications.warn(`Error performing Arcana check: ${err.message}`);
      return;
    }
  
    const margin = roll.total - dc;
    const consumed = await consumeResources(actor, selectedRecipe.componentUuid, component.name, goldCost);
    if (!consumed) {
      return;
    }
    const itemData = await createCraftedItem(actor, outcome, margin, basePrice);
    await createChatCard(actor, "Enchanting", selectedRecipe, outcome, component, roll, margin, dc);
  }
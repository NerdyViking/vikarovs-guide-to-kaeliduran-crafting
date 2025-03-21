// js/workshop/workshopWorkshop.js
console.log("workshopWorkshop.js loaded");

import { ComponentSelectorApplication } from './componentSelector.js';

export class WorkshopWorkshop {
  constructor(workshopInterface) {
    this.interface = workshopInterface;
    this.selectedOutcomeIndex = null;
  }

  async getCraftingContent() {
    const actor = this.interface._actor;
    if (!actor) return "<p>No actor selected. Please open this interface via a character sheet.</p>";

    const outcomeSlots = [0, 1, 2].map(index => `
      <div class="outcome-option" data-outcome-index="${index}" data-recipe-unlocked="false">
        <div class="outcome-icon-wrapper">
          <img class="outcome-icon" src="/icons/svg/mystery-man.svg" width="50" height="50" alt="Unknown Outcome">
          <div class="workshop-tooltip" style="display: none;">A mysterious creation awaiting discovery.</div>
        </div>
        <p class="outcome-name">Unknown Craft</p>
        <p class="tool-name">Unknown</p>
      </div>
    `).join('');

    return `
      <div class="crafting-workshop">
        <p>Drop or select a component to begin crafting:</p>
        <div class="component-row">
          <div class="component-slot">
            <div class="component-icon drop-zone component-drop-zone" 
                 data-type="component" 
                 style="background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');">
              <span class="clear-component" style="display: none;">X</span>
            </div>
            <p class="component-name">Drop or Select a Component Here</p>
          </div>
          <div class="crafting-requirements">
            <div class="requirement-row">
              <span class="requirement-label">DC:</span>
              <span class="dc-value">0</span>
            </div>
            <div class="requirement-row">
              <span class="requirement-label">Gold:</span>
              <span class="gold-value">0 gp</span>
            </div>
          </div>
        </div>
        <div class="outcome-options">
          ${outcomeSlots}
        </div>
        <div class="craft-button-container">
          <button class="craft-btn" disabled>Craft</button>
        </div>
      </div>
    `;
  }

  async activateListeners(html) {
    html.find('.component-drop-zone').on('dragover', (event) => {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    html.find('.component-drop-zone').on('drop', async (event) => {
      event.preventDefault();
      const rawData = event.originalEvent.dataTransfer.getData('text/plain');
      console.log("Raw drag data:", rawData);

      let data;
      try {
        if (!rawData || rawData === "undefined") {
          throw new Error("No valid drag data provided.");
        }
        data = JSON.parse(rawData);
      } catch (e) {
        console.error("Failed to parse drag data:", e, "Raw data:", rawData);
        ui.notifications.error("Failed to drop component: Invalid drag data.");
        return;
      }

      await this.handleComponentSelection(data.uuid || data.UUID, html);
    });

    html.find('.component-drop-zone').on('click', async (event) => {
      const actor = this.interface._actor;
      if (!actor) {
        ui.notifications.error("No actor selected.");
        return;
      }

      if (html.find('.component-drop-zone').data('component-id')) {
        return;
      }

      new ComponentSelectorApplication(actor, async (selectedComponent) => {
        await this.handleComponentSelection(selectedComponent.uuid, html);
      }).render(true);
    });

    html.find('.component-drop-zone').on('mouseenter', (event) => {
      const dropZone = $(event.currentTarget);
      if (dropZone.data('component-id')) {
        dropZone.find('.clear-component').css('display', 'block');
      }
    }).on('mouseleave', (event) => {
      $(event.currentTarget).find('.clear-component').css('display', 'none');
    });

    html.find('.clear-component').on('click', (event) => {
      event.stopPropagation();
      const dropZone = $(event.currentTarget).closest('.component-drop-zone');
      dropZone.data('component-id', null);
      dropZone.data('component-name', null);
      dropZone.css('background-image', `url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png')`);
      dropZone.siblings('.component-name').text("Drop a Component Here");

      const outcomeOptions = html.find('.outcome-options');
      outcomeOptions.find('.outcome-option').each((index, element) => {
        const $element = $(element);
        $element.removeClass('selected');
        $element.attr('data-recipe-unlocked', 'false');
        $element.find('.outcome-icon').attr('src', '/icons/svg/mystery-man.svg');
        $element.find('.outcome-name').text('Unknown Craft');
        $element.find('.tool-name').text('Unknown');
        $element.find('.workshop-tooltip').text('A mysterious creation awaiting discovery.');
      });

      const requirementsContainer = html.find('.crafting-requirements');
      requirementsContainer.find('.dc-value').text('0');
      requirementsContainer.find('.gold-value').text('0 gp');

      html.find('.craft-btn').prop('disabled', true);
      this.selectedOutcomeIndex = null;
    });

    html.find('.outcome-option').on('click', (event) => {
      const $outcome = $(event.currentTarget);
      const index = parseInt($outcome.data('outcome-index'));

      if (!html.find('.component-drop-zone').data('component-id')) {
        return;
      }

      html.find('.outcome-option').removeClass('selected');
      $outcome.addClass('selected');
      this.selectedOutcomeIndex = index;

      html.find('.craft-btn').prop('disabled', false);
    });

    html.on('mouseenter', '.outcome-icon-wrapper', (event) => {
      const $wrapper = $(event.currentTarget);
      const $outcome = $wrapper.closest('.outcome-option');
      const isRecipeUnlocked = $outcome.data('recipe-unlocked') === true || $outcome.data('recipe-unlocked') === 'true';

      if (isRecipeUnlocked) {
        return;
      }

      const $tooltip = $wrapper.find('.workshop-tooltip');
      $tooltip.css({
        display: 'block',
        top: $wrapper.position().top + $wrapper.outerHeight() + 10,
        left: $wrapper.position().left + ($wrapper.outerWidth() - $tooltip.outerWidth()) / 2
      });
    }).on('mouseleave', '.outcome-icon-wrapper', (event) => {
      $(event.currentTarget).find('.workshop-tooltip').hide();
    });

    html.on('click', '.craft-btn', async (event) => {
      if (this.selectedOutcomeIndex === null) {
        ui.notifications.warn("Please select an outcome to craft.");
        return;
      }
      await this.handleCrafting(this.selectedOutcomeIndex, html);
    });
  }

  async handleComponentSelection(uuid, html) {
    if (!uuid) {
      console.error("No UUID found in drag data:");
      ui.notifications.error("Invalid component dropped: No UUID found.");
      return;
    }

    let item;
    try {
      item = await fromUuid(uuid);
      if (!item) {
        const itemId = uuid.split('.').pop();
        item = game.items.get(itemId) || this.interface._actor?.items.get(itemId);
        if (!item) throw new Error("Item not found.");
      }
    } catch (e) {
      console.error("Failed to fetch item with UUID:", uuid, e);
      ui.notifications.error("Failed to fetch component: Invalid UUID.");
      return;
    }

    if (!item || !item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent')) {
      ui.notifications.warn("Please drop a valid component.");
      return;
    }

    const componentName = item.name.replace(/\(Copy\)/g, '').trim();
    console.log("Component name for recipe matching:", componentName);

    const dropZone = html.find('.component-drop-zone');
    dropZone.data('component-id', uuid);
    dropZone.data('component-name', componentName);
    dropZone.css('background-image', `url('${item.img || '/icons/svg/mystery-man.svg'}')`);
    dropZone.siblings('.component-name').text(item.name);

    const rarity = item.system?.rarity || "common";
    const craftingDC = this.calculateDC(rarity);
    const goldCost = this.calculateGoldCost(rarity);

    const requirementsContainer = html.find('.crafting-requirements');
    requirementsContainer.find('.dc-value').text(craftingDC);
    requirementsContainer.find('.gold-value').text(`${goldCost.toLocaleString()} gp`);

    const workshopRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes') || {};
    console.log("workshopRecipes:", workshopRecipes);

    let recipe = null;
    for (const r of Object.values(workshopRecipes)) {
      if (r.componentId) {
        const component = await fromUuid(r.componentId);
        if (component && component.name.replace(/\(Copy\)/g, '').trim() === componentName) {
          recipe = r;
          break;
        }
      }
    }

    if (!recipe) {
      ui.notifications.warn("No known recipe exists for this component.");
      return;
    }

    const outcomeOptions = html.find('.outcome-options');
    for (let i = 0; i < 3; i++) {
      const $outcome = outcomeOptions.find(`.outcome-option[data-outcome-index="${i}"]`);
      const outcomeData = recipe.outcomes[i];
      if (outcomeData) {
        const outcomeItem = await fromUuid(outcomeData.uuid);
        const toolItem = outcomeData.toolId ? await fromUuid(outcomeData.toolId) : null;
        const toolName = toolItem ? toolItem.name : this.getToolDisplayName(outcomeData.tool);
        const unidentifiedDesc = this.getUnidentifiedDescription(outcomeItem);
        
        $outcome.attr('data-recipe-unlocked', recipe.unlocked);
        $outcome.find('.outcome-icon').attr('src', outcomeItem?.img || '/icons/svg/mystery-man.svg');
        $outcome.find('.outcome-name').text(outcomeItem?.name || 'Unknown Craft');
        $outcome.find('.tool-name').text(toolName || 'Unknown');
        $outcome.find('.workshop-tooltip').text(unidentifiedDesc);
      } else {
        $outcome.attr('data-recipe-unlocked', recipe.unlocked);
        $outcome.find('.outcome-icon').attr('src', '/icons/svg/mystery-man.svg');
        $outcome.find('.outcome-name').text('Unknown Craft');
        $outcome.find('.tool-name').text('Unknown');
        $outcome.find('.workshop-tooltip').text('A mysterious creation awaiting discovery.');
      }
    }
  }

  async handleCrafting(outcomeIndex, html) {
    const componentId = html.find('.component-drop-zone').data('component-id');
    const componentName = html.find('.component-drop-zone').data('component-name');
    if (!componentId || !componentName) return ui.notifications.error("No component selected.");

    const actor = this.interface._actor;
    const component = await fromUuid(componentId);
    const workshopRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes') || {};

    let recipe = null;
    for (const r of Object.values(workshopRecipes)) {
      if (r.componentId) {
        const component = await fromUuid(r.componentId);
        if (component && component.name.replace(/\(Copy\)/g, '').trim() === componentName) {
          recipe = r;
          break;
        }
      }
    }

    if (!recipe) return;

    const outcomeData = recipe.outcomes[outcomeIndex];
    if (!outcomeData) {
      ui.notifications.error("Selected outcome is not available.");
      return;
    }

    const outcomeItem = await fromUuid(outcomeData.uuid);
    const toolItem = outcomeData.toolId ? await fromUuid(outcomeData.toolId) : null;
    const toolType = toolItem ? toolItem.system?.type?.baseItem : outcomeData.tool || "none";

    const goldOwned = actor.system.currency.gp || 0;
    const goldCost = this.calculateGoldCost(component.system.rarity);
    if (goldOwned < goldCost) {
      return ui.notifications.error(`You need ${goldCost} gp (have ${goldOwned} gp).`);
    }

    const toolName = this.getToolDisplayName(toolType);
    console.log("Looking for tool in inventory:", toolName, "toolType:", toolType);
    const tool = actor.items.find(i => 
      i.type === "tool" && i.name.toLowerCase().includes(toolName.toLowerCase())
    );

    if (!tool) {
      return ui.notifications.warn(`${actor.name} does not have ${toolName} in their inventory.`);
    }

    const dc = this.calculateDC(component.system.rarity);
    const rollResult = await tool.rollToolCheck({
      dc: dc,
      rollMode: "publicroll",
      fastForward: false
    });

    if (!rollResult) return;

    const rollTotal = rollResult[0]?.total;
    if (rollTotal === undefined) {
      console.error("Failed to get roll total from rollResult:", rollResult);
      ui.notifications.error("Failed to process tool check result.");
      return;
    }

    console.log("Roll total:", rollTotal, "DC:", dc, "Difference:", rollTotal - dc);
    const quality = this.determineQuality(rollTotal, dc);
    const craftedItem = await this.createCraftedItem(outcomeItem, quality);

    const existingItem = actor.items.find(i => i.name === craftedItem.name);
    if (existingItem) {
      const currentQuantity = existingItem.system.quantity || 1;
      await existingItem.update({ "system.quantity": currentQuantity + 1 });
      ui.notifications.info(`Increased quantity of ${craftedItem.name} to ${currentQuantity + 1}.`);
    } else {
      await actor.createEmbeddedDocuments("Item", [craftedItem]);
      ui.notifications.info(`Crafted: ${craftedItem.name}`);
    }

    await actor.update({ "system.currency.gp": goldOwned - goldCost });

    if (componentId.includes("Actor.")) {
      const parts = componentId.split('.');
      const actorId = parts[1];
      const itemId = parts[3];
      const sourceActor = game.actors.get(actorId);
      if (sourceActor) {
        const item = sourceActor.items.get(itemId);
        if (item) {
          const currentQuantity = item.system.quantity || 1;
          const newQuantity = currentQuantity - 1;
          if (newQuantity <= 0) {
            await item.delete();
            ui.notifications.info(`Consumed component: ${item.name}`);
          } else {
            await item.update({ "system.quantity": newQuantity });
            ui.notifications.info(`Reduced quantity of ${item.name} to ${newQuantity}.`);
          }
        }
      }
    } else {
      ui.notifications.info("Component was not consumed (sourced from world or compendium).");
    }

    if (!recipe.unlocked) {
      recipe.unlocked = true;
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', workshopRecipes);
      this.interface.render(false);
    }
  }

  getToolDisplayName(toolType) {
    const toolMap = {
      "alchemist": "Alchemist's Supplies",
      "brewer": "Brewer's Supplies",
      "calligrapher": "Calligrapher's Supplies",
      "carpenter": "Carpenter's Tools",
      "cartographer": "Cartographer's Tools",
      "cobbler": "Cobbler's Tools",
      "cook": "Cook's Utensils",
      "glassblower": "Glassblower's Tools",
      "jeweler": "Jeweler's Tools",
      "leatherworker": "Leatherworker's Tools",
      "mason": "Mason's Tools",
      "painter": "Painter's Supplies",
      "potter": "Potter's Tools",
      "smith": "Smith's Tools",
      "tinker": "Tinker's Tools",
      "weaver": "Weaver's Tools",
      "woodcarver": "Woodcarver's Tools",
      "none": "No Tool"
    };
    return toolMap[toolType] || "Unknown Tool";
  }

  calculateDC(rarity) {
    switch (rarity) {
      case "uncommon": return 15;
      case "rare": return 20;
      case "very rare": case "veryrare": return 25;
      case "legendary": return 30;
      default: return 10;
    }
  }

  calculateGoldCost(rarity) {
    switch (rarity) {
      case "uncommon": return 200;
      case "rare": return 2000;
      case "very rare": case "veryrare": return 20000;
      case "legendary": return 100000;
      default: return 50;
    }
  }

  determineQuality(rollTotal, dc) {
    const difference = rollTotal - dc;
    if (difference >= 10) return "masterwork";
    if (difference >= 0) return "normal";
    if (difference >= -9) return "shoddy";
    return "patchwork";
  }

  async createCraftedItem(baseItem, quality) {
    const itemData = baseItem.toObject();
    let priceMultiplier = 1;
    let flavorText = "";

    switch (quality) {
      case "masterwork":
        priceMultiplier = 4;
        flavorText = "<p><i>This item is of masterwork quality, showcasing exceptional craftsmanship.</i></p>";
        itemData.name = `Masterwork ${itemData.name}`;
        break;
      case "shoddy":
        priceMultiplier = 0.5;
        flavorText = "<p><i>This item bears the marks of shoddy workmanship, reducing its reliability.</i></p>";
        itemData.name = `Shoddy ${itemData.name}`;
        break;
      case "patchwork":
        priceMultiplier = 0;
        flavorText = "<p><i>This item is a patchwork mess, barely holding together.</i></p>";
        itemData.name = `Patchwork ${itemData.name}`;
        break;
    }

    itemData.system.description.value += flavorText;
    if (itemData.system.price?.value) {
      itemData.system.price.value = Math.round(itemData.system.price.value * priceMultiplier);
    }
    return itemData;
  }

  stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  }

  getUnidentifiedDescription(item) {
    const unidentifiedDesc = item?.system?.unidentified?.description;
    if (unidentifiedDesc) {
      return this.stripHtml(unidentifiedDesc);
    }

    const type = item.type;
    const desc = item.system.description.value || "";
    if (desc.includes("weapon")) return "A finely honed instrument of war.";
    if (type === "armor") return "A sturdy shell to ward off blows.";
    return "A mysterious creation awaiting discovery.";
  }
}
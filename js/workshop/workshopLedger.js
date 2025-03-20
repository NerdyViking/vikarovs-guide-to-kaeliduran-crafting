// js/workshop/workshopLedger.js
console.log("workshopLedger.js loaded");

export class WorkshopLedger {
  constructor(workshopInterface) {
    this.interface = workshopInterface;
    this.editingRecipeId = null; // Track the recipe being edited

    // Define withTimeout at the class level
    this.withTimeout = (promise, timeoutMs, errorMessage) => {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      });
      return Promise.race([promise, timeout]);
    };

    // Map tool baseItem to display names
    this.toolNameMap = {
      'alchemist': "Alchemist's Supplies",
      'brewer': "Brewer's Supplies",
      'calligrapher': "Calligrapher's Supplies",
      'carpenter': "Carpenter's Tools",
      'cartographer': "Cartographer's Tools",
      'cobbler': "Cobbler's Tools",
      'cook': "Cook's Utensils",
      'glassblower': "Glassblower's Tools",
      'jeweler': "Jeweler's Tools",
      'leatherworker': "Leatherworker's Tools",
      'mason': "Mason's Tools",
      'painter': "Painter's Supplies",
      'potter': "Potter's Tools",
      'smith': "Smith's Tools",
      'tinker': "Tinker's Tools",
      'weaver': "Weaver's Tools",
      'woodcarver': "Woodcarver's Tools",
      'none': "No Tool"
    };

    // Array of known tool baseItem identifiers for validation
    this.validToolTypes = [
      "alchemist", "brewer", "calligrapher", "carpenter", "cartographer", 
      "cobbler", "cook", "glassblower", "jeweler", "leatherworker", 
      "mason", "painter", "potter", "smith", "tinker", "weaver", "woodcarver"
    ];
  }

  async getRecipeViewerContent(selectedRecipe, newRecipeMode, isGM) {
    if (newRecipeMode) {
      return `
        <div class="recipe-details">
          <textarea class="recipe-description-input" placeholder="Enter description..."></textarea>
          <div class="recipe-border">
            <div class="component-row">
              <div class="component-display">
                <div class="component-icon drop-zone component-drop-zone" data-type="component" style="background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');"></div>
                <p class="component-name">Click or Drop a Component Below</p>
                <span class="remove-component" style="display: none;">X</span>
              </div>
            </div>
            <div class="tool-row">
              ${[0, 1, 2].map(index => `
                <div class="tool-icon-container">
                  <div class="tool-icon drop-zone tool-drop-zone tooltip-trigger" data-index="${index}" data-type="tool" data-custom-tooltip="Drop a tool item here">
                    <span class="tool-placeholder">+</span>
                  </div>
                  <p class="tool-name">No Tool</p>
                </div>
              `).join('')}
            </div>
            <div id="outcome-slots">
              ${[0, 1, 2].map((index, i) => `
                <div class="outcome-slot${i + 1}">
                  <div class="component-icon drop-zone outcome-drop-zone" data-type="outcome" data-index="${index}" style="background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');"></div>
                  <p class="component-name">Click or Drop an Outcome Below</p>
                  <span class="remove-component" style="display: none;">X</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="edit-buttons">
            <button type="button" class="save-btn">Save Recipe</button>
          </div>
        </div>
      `;
    }
    if (selectedRecipe) {
      // Fetch recipe data
      const workshopRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes') || {};
      const recipeData = workshopRecipes[selectedRecipe.id] || {};
      const rawOutcomes = recipeData.outcomes || [];
      const outcomes = Array(3).fill(null).map((_, index) => rawOutcomes[index] || {});
      const hasComponent = !!recipeData.componentId;

      // Prepare outcome slots for read-only view
      const outcomeDisplays = await Promise.all(outcomes.map(async (outcomeData, index) => {
        let outcomeItem = null;
        let unidentifiedDesc = "";

        if (outcomeData.uuid) {
          try {
            outcomeItem = await this.withTimeout(
              fromUuid(outcomeData.uuid),
              5000,
              `Timeout: Failed to fetch outcome for recipe ${selectedRecipe.id}, index ${index}`
            );
            
            // Extract unidentified description if available
            if (outcomeItem) {
              unidentifiedDesc = outcomeItem.getFlag('dnd5e', 'unidentifiedDescription') || 
                                outcomeItem.system?.unidentified?.description || 
                                outcomeItem.system?.unidentifiedDescription ||
                                "A mysterious item with unknown properties.";
            }
          } catch (err) {
            console.error(`Error fetching outcome ${index} for recipe ${selectedRecipe.id}:`, err);
          }
        }
        
        return `
          <div class="outcome-slot${index + 1}">
            <div class="component-icon tooltip-trigger" 
                 style="background-image: url('${outcomeItem?.img || 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png'}');"
                 data-custom-tooltip="${unidentifiedDesc ? this._escapeHtml(unidentifiedDesc) : 'Unknown item'}">
            </div>
            <p class="component-name">${outcomeItem?.name || 'Click or Drop an Outcome Below'}</p>
          </div>
        `;
      }));

      // Prepare tool icons for the tool row
      const toolIcons = await Promise.all(outcomes.map(async (outcomeData, index) => {
        let toolName = "No Tool";
        let toolImg = 'modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png';
        let toolDesc = "No tool is needed for this item.";
        let toolId = '';
        let toolType = 'none';
        
        // Check if we have a toolId (new system) or toolType (old system)
        if (outcomeData.toolId) {
          try {
            const toolItem = await this.withTimeout(
              fromUuid(outcomeData.toolId),
              5000,
              `Timeout: Failed to fetch tool for recipe ${selectedRecipe.id}, index ${index}`
            );
            
            if (toolItem) {
              toolName = toolItem.name;
              toolImg = toolItem.img;
              toolId = outcomeData.toolId;
              toolDesc = toolItem.system?.description?.value || "A crafting tool.";
              
              // Try to determine tool type from baseItem
              const baseItem = toolItem.system?.type?.baseItem || '';
              if (this.validToolTypes.includes(baseItem)) {
                toolType = baseItem;
              }
            }
          } catch (err) {
            console.error(`Error fetching tool for recipe ${selectedRecipe.id}, index ${index}:`, err);
          }
        } else if (outcomeData.tool && outcomeData.tool !== 'none') {
          // Handle legacy tool type strings
          toolType = outcomeData.tool;
          toolName = this.toolNameMap[toolType] || "Unknown Tool";
          toolDesc = `This magic item is crafted with ${toolName}.`;
        }
        
        return `
        <div class="tool-icon-container">
          <div class="tool-icon tooltip-trigger ${isGM && this.editingRecipeId === selectedRecipe.id ? 'drop-zone tool-drop-zone' : ''}" 
               ${isGM && this.editingRecipeId === selectedRecipe.id ? `data-type="tool" data-index="${index}"` : ''}
               data-tool-type="${toolType}"
               data-tool-id="${toolId}"
               data-custom-tooltip="${toolDesc}">
            <div class="tool-image" style="background-image: url('${toolImg}'); width: 100%; height: 100%; background-size: contain; background-position: center; background-repeat: no-repeat;"></div>
            ${toolType === 'none' && !toolId ? '<span class="tool-placeholder">+</span>' : ''}
          </div>
          <p class="tool-name">${toolName}</p>
          ${isGM && this.editingRecipeId === selectedRecipe.id && (toolId || toolType !== 'none') ? 
            `<span class="remove-tool" data-index="${index}">X</span>` : ''}
        </div>
      `;
      }));

      // Prepare outcome slots for edit mode
      const outcomeSlots = [];
      if (isGM && this.editingRecipeId === selectedRecipe.id) {
        for (let i = 0; i < 3; i++) {
          const outcomeData = outcomes[i] || {};
          let outcome = null;
          let unidentifiedDesc = "";
          
          if (outcomeData.uuid) {
            try {
              outcome = await this.withTimeout(
                fromUuid(outcomeData.uuid),
                5000,
                `Timeout: Failed to fetch outcome for recipe ${selectedRecipe.id}, index ${i}`
              );
              
              // Extract unidentified description if available
              if (outcome) {
                unidentifiedDesc = outcome.getFlag('dnd5e', 'unidentifiedDescription') || 
                                  outcome.system?.unidentified?.description || 
                                  outcome.system?.unidentifiedDescription ||
                                  "A mysterious item with unknown properties.";
              }
            } catch (err) {
              console.error(err);
            }
          }
          
          outcomeSlots.push(`
            <div class="outcome-slot${i + 1}">
              <div class="component-icon drop-zone outcome-drop-zone tooltip-trigger" 
                   data-type="outcome" data-index="${i}" data-outcome-id="${outcomeData.uuid || ''}" 
                   style="${outcome ? `background-image: url('${outcome.img}');` : `background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');`}"
                   data-custom-tooltip="${unidentifiedDesc ? this._escapeHtml(unidentifiedDesc) : 'Drop an item here'}">
              </div>
              <p class="component-name">${outcome ? outcome.name : 'Click or Drop an Outcome Below'}</p>
              <span class="remove-component" style="${outcome ? 'display: block;' : 'display: none;'}">X</span>
            </div>
          `);
        }
      } else {
        if (hasComponent) {
          outcomeSlots.push(...outcomeDisplays);
        } else {
          for (let i = 0; i < 3; i++) {
            outcomeSlots.push(`
              <div class="outcome-slot${i + 1}">
                <div class="component-icon" style="background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');"></div>
                <p class="component-name">Click or Drop an Outcome Below</p>
              </div>
            `);
          }
        }
      }

      // Get unidentified description for component if available
      let componentUnidentifiedDesc = "";
      if (recipeData.componentId) {
        try {
          const component = await this.withTimeout(
            fromUuid(recipeData.componentId),
            5000,
            `Timeout: Failed to fetch component for recipe ${selectedRecipe.id}`
          );
          if (component) {
            componentUnidentifiedDesc = component.getFlag('dnd5e', 'unidentifiedDescription') || 
                                      component.system?.unidentified?.description || 
                                      component.system?.unidentifiedDescription ||
                                      "A strange component with unknown properties.";
          }
        } catch (err) {
          console.error(`Failed to fetch component unidentified description for recipe ${selectedRecipe.id}:`, err);
        }
      }

      // Prepare component display for edit mode
      let componentHtml = '';
      if (isGM && this.editingRecipeId === selectedRecipe.id) {
        componentHtml = `
          <div class="component-display">
            <div class="component-icon drop-zone component-drop-zone tooltip-trigger" 
                 data-type="component" data-component-id="${recipeData.componentId || ''}" 
                 style="${recipeData.componentId ? `background-image: url('${selectedRecipe.componentIcon}');` : `background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');`}"
                 data-custom-tooltip="${componentUnidentifiedDesc ? this._escapeHtml(componentUnidentifiedDesc) : 'Drop a component here'}">
            </div>
            <p class="component-name">${recipeData.componentId ? selectedRecipe.name : 'Click or Drop a Component Below'}</p>
            <span class="remove-component" style="${recipeData.componentId ? 'display: block;' : 'display: none;'}">X</span>
          </div>
        `;
      } else {
        componentHtml = `
          <div class="component-display">
            <div class="component-icon tooltip-trigger" 
                 style="${recipeData.componentId ? `background-image: url('${selectedRecipe.componentIcon}');` : `background-image: url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png');`}"
                 data-custom-tooltip="${componentUnidentifiedDesc ? this._escapeHtml(componentUnidentifiedDesc) : 'Unknown component'}">
            </div>
            <p class="component-name">${recipeData.componentId ? selectedRecipe.name : 'Click or Drop a Component Below'}</p>
          </div>
        `;
      }

      // Render the middle pane
      console.log("Rendering read-only view, isGM:", isGM);
      return `
        <div class="recipe-details">
          ${isGM && this.editingRecipeId === selectedRecipe.id ? `<textarea class="recipe-description-input">${recipeData.description || ''}</textarea>` : (recipeData.description ? `<p class="description">${recipeData.description}</p>` : '')}
          <div class="recipe-border">
            <div class="component-row">
              ${componentHtml}
            </div>
            <div class="tool-row">
              ${toolIcons.join('')}
            </div>
            <div id="outcome-slots">
              ${outcomeSlots.join('')}
            </div>
          </div>
          ${isGM ? `
            <div class="edit-buttons">
              ${this.editingRecipeId === selectedRecipe.id ? `
                <button type="button" class="save-btn">Save Changes</button>
                <button type="button" class="cancel-btn">Cancel</button>
              ` : `
                <button class="toggle-edit-btn" data-recipe-id="${selectedRecipe.id}">Edit Recipe</button>
              `}
            </div>
          ` : ''}
        </div>
      `;
    }
    return "Select a recipe to view details.";
  }

  activateListeners(html) {
    // Toggle edit mode
    html.find('.toggle-edit-btn').on('click', (event) => {
      const recipeId = $(event.currentTarget).data('recipe-id');
      this.editingRecipeId = (this.editingRecipeId === recipeId) ? null : recipeId;
      this.interface.render(false);
    });

    // Cancel edit mode
    html.find('.cancel-btn').on('click', () => {
      this.editingRecipeId = null;
      this.interface.newRecipeMode = false;
      this.interface.render(false);
    });

    // Handle save for both new and edit modes
    html.find('.save-btn').on('click', async (event) => {
      const description = html.find('.recipe-description-input').val();
      const componentId = html.find('.component-drop-zone').data('component-id');
      const outcomeSlots = html.find('#outcome-slots .outcome-drop-zone');
      
      // Get tool data from the tool-drop-zone elements
      const toolData = html.find('.tool-drop-zone').map((i, el) => {
        const $el = $(el);
        const toolId = $el.data('tool-id') || '';
        return {
          index: $el.data('index'),
          toolId,
          toolType: $el.data('tool-type') || 'none'
        };
      }).get();
      
      // Build outcomes array
      const outcomes = outcomeSlots.toArray().map((slot, index) => {
        const uuid = $(slot).data('outcome-id');
        if (!uuid) return null;
        
        // Find matching tool for this outcome
        const toolInfo = toolData.find(t => t.index.toString() === index.toString()) || { toolId: '', toolType: 'none' };
        
        return { 
          uuid, 
          toolId: toolInfo.toolId,
          tool: toolInfo.toolType // Keep for backward compatibility
        };
      }).filter(Boolean);

      const workshopRecipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes') || {};
      if (this.interface.newRecipeMode) {
        // New recipe
        const newRecipeId = `recipe${Date.now()}`;
        workshopRecipes[newRecipeId] = {
          id: newRecipeId,
          componentId: componentId || null,
          description: description || "",
          outcomes: outcomes,
          unlocked: false
        };
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', workshopRecipes);
        this.interface.newRecipeMode = false;
        this.interface.selectedRecipeId = newRecipeId;
      } else if (this.editingRecipeId) {
        // Edit existing recipe
        const recipeId = this.editingRecipeId;
        if (workshopRecipes[recipeId]) {
          workshopRecipes[recipeId].description = description || workshopRecipes[recipeId].description;
          workshopRecipes[recipeId].componentId = componentId || null;
          workshopRecipes[recipeId].outcomes = outcomes;
          await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', workshopRecipes);
        }
      }
      this.editingRecipeId = null;
      this.interface.render(false);
    });

    // Custom tooltip handling
    html.find('.tooltip-trigger').on('mouseenter', (event) => {
      const target = $(event.currentTarget);
      const tooltipText = target.data('custom-tooltip');
      
      if (tooltipText) {
        const tooltipElement = $('<div class="workshop-tooltip"></div>');
        tooltipElement.html(tooltipText);
        $('body').append(tooltipElement);
        
        // Position the tooltip
        const targetRect = event.currentTarget.getBoundingClientRect();
        tooltipElement.css({
          top: targetRect.top + window.scrollY - tooltipElement.outerHeight() - 10,
          left: targetRect.left + window.scrollX + (targetRect.width / 2) - (tooltipElement.outerWidth() / 2)
        });
      }
    }).on('mouseleave', () => {
      $('.workshop-tooltip').remove();
    });

    // Drag-and-drop for components
    html.find('.component-drop-zone').on('dragover', (event) => {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    html.find('.component-drop-zone').on('drop', async (event) => {
      event.preventDefault();
      const data = event.originalEvent.dataTransfer.getData('text/plain');
      console.log("Component drop data:", data);
      let uuid;
      try {
        const parsedData = JSON.parse(data);
        console.log("Parsed component drop data:", parsedData);
        uuid = parsedData.uuid || parsedData.UUID;
        if (!uuid) throw new Error("No UUID found in drag data");
      } catch (e) {
        console.error("Failed to parse component drop data:", e);
        uuid = data;
      }

      try {
        if (!uuid.startsWith("Item.")) {
          uuid = `Item.${uuid}`; // Ensure proper UUID format
        }
        console.log("Fetching component with UUID:", uuid);
        const item = await this.withTimeout(
          fromUuid(uuid),
          5000,
          `Timeout: Failed to fetch item during drop, uuid: ${uuid}`
        );
        if (!item) throw new Error("Item not found");
        const isComponent = item.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'isComponent');
        console.log("Dropped item:", item, "isComponent:", isComponent);
        if (item && isComponent === true) {
          const dropZone = $(event.currentTarget);
          
          // Get unidentified description
          const unidentifiedDesc = item.getFlag('dnd5e', 'unidentifiedDescription') || 
                                item.system?.unidentified?.description || 
                                item.system?.unidentifiedDescription ||
                                "A mysterious component with unknown properties.";
          
          dropZone.data('component-id', uuid);
          dropZone.data('custom-tooltip', unidentifiedDesc);
          dropZone.css('background-image', `url('${item.img || '/icons/svg/mystery-man.svg'}')`);
          dropZone.closest('.component-display').find('.component-name').text(item.name || 'Unknown Component');
          dropZone.siblings('.remove-component').css('display', 'block');
        } else {
          ui.notifications.warn("Please drop a valid component item.");
        }
      } catch (err) {
        console.error("Failed to drop component:", err);
        ui.notifications.error(`Failed to drop component: ${err.message}`);
      }
    });

    // Drag-and-drop for outcomes
    html.find('.outcome-drop-zone').on('dragover', (event) => {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    html.find('.outcome-drop-zone').on('drop', async (event) => {
      event.preventDefault();
      const data = event.originalEvent.dataTransfer.getData('text/plain');
      console.log("Outcome drop data:", data);
      let uuid;
      try {
        const parsedData = JSON.parse(data);
        console.log("Parsed outcome drop data:", parsedData);
        uuid = parsedData.uuid || parsedData.UUID;
        if (!uuid) throw new Error("No UUID found in drag data");
      } catch (e) {
        console.error("Failed to parse outcome drop data:", e);
        uuid = data;
      }

      try {
        if (!uuid.startsWith("Item.")) {
          uuid = `Item.${uuid}`; // Ensure proper UUID format
        }
        console.log("Fetching outcome with UUID:", uuid);
        const item = await this.withTimeout(
          fromUuid(uuid),
          5000,
          `Timeout: Failed to fetch outcome item during drop, uuid: ${uuid}`
        );
        if (!item) throw new Error("Item not found");
        console.log("Dropped outcome item:", item);
        const dropZone = $(event.currentTarget);
        const index = parseInt(dropZone.data('index'));
        
        // Get unidentified description
        const unidentifiedDesc = item.getFlag('dnd5e', 'unidentifiedDescription') || 
                              item.system?.unidentified?.description || 
                              item.system?.unidentifiedDescription ||
                              "A mysterious item with unknown properties.";
        
        dropZone.data('outcome-id', uuid);
        dropZone.data('custom-tooltip', unidentifiedDesc);
        dropZone.css('background-image', `url('${item.img || '/icons/svg/mystery-man.svg'}')`);
        dropZone.closest('.outcome-slot' + (index + 1)).find('.component-name').text(item.name || 'Unknown Outcome');
        dropZone.siblings('.remove-component').css('display', 'block');
      } catch (err) {
        console.error("Failed to drop outcome:", err);
        ui.notifications.error(`Failed to drop outcome: ${err.message}`);
      }
    });

    // NEW: Drag-and-drop for tools
    html.find('.tool-drop-zone').on('dragover', (event) => {
      event.preventDefault();
      event.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    html.find('.tool-drop-zone').on('drop', async (event) => {
      event.preventDefault();
      const data = event.originalEvent.dataTransfer.getData('text/plain');
      console.log("Tool drop data:", data);
      let uuid;
      try {
        const parsedData = JSON.parse(data);
        console.log("Parsed tool drop data:", parsedData);
        uuid = parsedData.uuid || parsedData.UUID;
        if (!uuid) throw new Error("No UUID found in drag data");
      } catch (e) {
        console.error("Failed to parse tool drop data:", e);
        uuid = data;
      }

      try {
        if (!uuid.startsWith("Item.")) {
          uuid = `Item.${uuid}`; // Ensure proper UUID format
        }
        console.log("Fetching tool with UUID:", uuid);
        const item = await this.withTimeout(
          fromUuid(uuid),
          5000,
          `Timeout: Failed to fetch tool item during drop, uuid: ${uuid}`
        );
        if (!item) throw new Error("Item not found");
        
        // Check if this is a valid tool
        const isTool = item.type === 'tool' || (item.type === 'equipment' && item.system?.toolType);
        const baseItem = item.system?.type?.baseItem || '';
        let toolType = 'none';
        
        if (this.validToolTypes.includes(baseItem)) {
          toolType = baseItem;
        }
        
        console.log("Dropped item:", item, "isTool:", isTool, "baseItem:", baseItem, "toolType:", toolType);
        
        if (isTool || this.validToolTypes.includes(baseItem)) {
          const dropZone = $(event.currentTarget);
          const toolContainer = dropZone.closest('.tool-icon-container');
          const toolDesc = item.system?.description?.value || `This is ${item.name}.`;
          
// Update the dropzone with the tool data
dropZone.data('tool-id', uuid);
dropZone.data('tool-type', toolType);
dropZone.data('custom-tooltip', toolDesc);

// Either create or update the tool image div
let toolImageDiv = dropZone.find('.tool-image');
if (toolImageDiv.length === 0) {
  toolImageDiv = $('<div class="tool-image"></div>');
  dropZone.append(toolImageDiv);
}

// Set the background image on the tool image div
toolImageDiv.attr('style', `background-image: url('${item.img || '/icons/svg/mystery-man.svg'}'); width: 100%; height: 100%; background-size: contain; background-position: center; background-repeat: no-repeat;`);

// Remove the placeholder if it exists
dropZone.find('.tool-placeholder').remove();
          
          // Make sure remove button is visible
          toolContainer.find('.remove-tool').css('display', 'block');
        } else {
          ui.notifications.warn("Please drop a valid tool item.");
        }
      } catch (err) {
        console.error("Failed to drop tool:", err);
        ui.notifications.error(`Failed to drop tool: ${err.message}`);
      }
    });

    // NEW: Remove tool button
    html.find('.remove-tool').on('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const $removeBtn = $(event.currentTarget);
      const index = $removeBtn.data('index');
      const toolContainer = $removeBtn.closest('.tool-icon-container');
      const toolIcon = toolContainer.find('.tool-icon');
      
// Reset the tool data
toolIcon.data('tool-id', '');
toolIcon.data('tool-type', 'none');
toolIcon.data('custom-tooltip', 'Drop a tool item here');

// Remove existing tool image if present
toolIcon.find('.tool-image').remove();

// Add placeholder back
if (toolIcon.find('.tool-placeholder').length === 0) {
  toolIcon.append('<span class="tool-placeholder">+</span>');
}
      
      // Update the tool name
      toolContainer.find('.tool-name').text('No Tool');
      
      // Hide the remove button
      $removeBtn.hide();
    });

    // Remove component or outcome
    html.find('.remove-component').on('click', (event) => {
      const dropZone = $(event.currentTarget).closest('.component-display, .outcome-slot1, .outcome-slot2, .outcome-slot3').find('.drop-zone');
      const isComponent = dropZone.data('type') === 'component';
      dropZone.data(isComponent ? 'component-id' : 'outcome-id', null);
      dropZone.data('custom-tooltip', isComponent ? 'Drop a component here' : 'Drop an item here');
      dropZone.css('background-image', `url('modules/vikarovs-guide-to-kaeliduran-crafting/assets/question-mark.png')`);
      dropZone.closest('.component-display, .outcome-slot1, .outcome-slot2, .outcome-slot3').find('.component-name').text(isComponent ? 'Click or Drop a Component Below' : 'Click or Drop an Outcome Below');
      dropZone.siblings('.remove-component').css('display', 'none');
    });
  }

  // Helper method to escape HTML special characters for tooltips
  _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
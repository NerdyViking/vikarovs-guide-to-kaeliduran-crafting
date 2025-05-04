import { handleRecipeBookListeners } from './workshopRecipeBook.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RecipeCreationApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(workshopInterface, options = {}) {
    super(options);
    this.workshopInterface = workshopInterface;
    this.recipeId = options.recipeId || null;
    this.formData = options.initialData || {
      component: null,
      outcomes: new Array(5).fill(null),
      tools: new Array(5).fill(null),
      allowedGroups: [],
      hideFromPlayers: true
    };
    this._handleDrop = this._handleDrop.bind(this);
    this._handleCancel = this._handleCancel.bind(this);
    this._handleSave = this._handleSave.bind(this);
    this._handleClearSlot = this._handleClearSlot.bind(this);
    this._handleClearAllSlots = this._handleClearAllSlots.bind(this);
  }

  static DEFAULT_OPTIONS = {
    id: "recipe-creation-app",
    classes: ["vikarovs-recipe-creation"],
    window: {
      title: "Create New Recipe",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 600,
      height: "auto"
    }
  };

  static PARTS = {
    main: {
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/recipeCreation.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.formData = this.formData;
    context.tools = this.formData.tools;
    context.campaigns = game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.getActiveGroups().reduce((acc, group) => {
      acc[group.id] = { name: group.name };
      return acc;
    }, {});
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) return;

    const form = this.element.querySelector('form');
    if (!form) return;

    form.querySelectorAll('.drop-zone').forEach(zone => {
      zone.addEventListener('drop', this._handleDrop);
      zone.addEventListener('click', (event) => {
        const img = event.target.closest('.slot-image');
        if (img) {
          event.preventDefault();
          event.stopPropagation();
          const uuid = img.dataset.uuid;
          if (uuid) {
            fromUuid(uuid).then(item => {
              if (item) {
                item.sheet.render(true);
              }
            }).catch(err => {
              console.error(`Error fetching item with UUID ${uuid}:`, err);
            });
          }
        }
      });

      const clearButton = zone.querySelector('.clear-slot');
      if (clearButton) {
        clearButton.addEventListener('click', this._handleClearSlot);
      }
    });

    const saveButton = this.element.querySelector('.save-btn');
    if (saveButton) {
      saveButton.addEventListener('click', this._handleSave);
    }

    const clearAllButton = this.element.querySelector('.clear-all-btn');
    if (clearAllButton) {
      clearAllButton.addEventListener('click', this._handleClearAllSlots);
    }

    const cancelButton = this.element.querySelector('.cancel-btn');
    if (cancelButton) {
      cancelButton.addEventListener('click', this._handleCancel);
    }

    handleRecipeBookListeners(this.workshopInterface, this.element);
  }

  async _handleDrop(event) {
    event.preventDefault();
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      ui.notifications.warn("Invalid drop target.");
      return;
    }

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (error) {
      ui.notifications.warn("Invalid drop data.");
      return;
    }

    if (!data.type || !data.uuid) {
      ui.notifications.warn("Invalid item data.");
      return;
    }

    const item = await fromUuid(data.uuid);
    if (!item) {
      ui.notifications.warn("Item not found.");
      return;
    }

    const type = target.dataset.type;
    const index = target.dataset.index;

    const isValid = await game.modules.get('vikarovs-guide-to-kaeliduran-crafting').api.groupManager.isItemValidForCrafting(item, type);
    if (!isValid) {
      ui.notifications.warn(`Only ${type}s can be dropped here.`);
      return;
    }

    const itemData = {
      uuid: data.uuid,
      img: item.img || '',
      name: item.name || "Unknown Item"
    };

    if ('dataset' in target) {
      target.dataset.item = JSON.stringify(itemData);
    }

    if (type === 'component') {
      this.formData.component = itemData;
    } else if (type === 'outcome' && index !== undefined) {
      this.formData.outcomes[index] = itemData;
    } else if (type === 'tool' && index !== undefined) {
      this.formData.tools[index] = itemData;
    }

    target.innerHTML = `
      <img src="${itemData.img}" alt="${itemData.name}" class="slot-image" data-uuid="${itemData.uuid}"/>
      <span class="slot-name">${itemData.name}</span>
      <span class="clear-slot" data-type="${type}"${index !== undefined ? ` data-index="${index}"` : ''} title="Clear Slot"><i class="fas fa-times"></i></span>
    `;
    await this.render({ force: true });
  }

  async _handleClearSlot(event) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const type = target.dataset.type;
    const index = target.dataset.index;

    if (type === 'component') {
      this.formData.component = null;
    } else if (type === 'outcome' && index !== undefined) {
      this.formData.outcomes[index] = null;
    } else if (type === 'tool' && index !== undefined) {
      this.formData.tools[index] = null;
    }

    await this.render({ force: true });
  }

  async _handleClearAllSlots(event) {
    event.preventDefault();
    event.stopPropagation();
    this.formData.component = null;
    this.formData.outcomes = new Array(5).fill(null);
    this.formData.tools = new Array(5).fill(null);
    await this.render({ force: true });
  }

  async _handleCancel(event) {
    event.preventDefault();
    await this.close();
  }

  async _handleSave(event) {
    event.preventDefault();
    const form = this.element.querySelector('form');
    if (!form) {
      ui.notifications.error("Form not found.");
      return;
    }

    const formData = new FormData(form);
    if (!this.formData.component) {
      ui.notifications.error("A component is required for the recipe.");
      return;
    }

    // Validate allowedGroups
    const allowedGroups = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('campaign-') && value) {
        allowedGroups.push(value);
      }
    }
    if (allowedGroups.length === 0) {
      ui.notifications.error("At least one campaign must be assigned to the recipe.", { recipient: "gm" });
      return;
    }

    // Resolve the component's name from its UUID
    const component = await fromUuid(this.formData.component.uuid);
    if (!component) {
      ui.notifications.error(`Invalid item UUID for component '${this.formData.component.name}'. Please assign a valid item.`, { recipient: "gm" });
      return;
    }
    const name = component.name || "Unknown Component";

    // Validate outcomes
    const validOutcomes = [];
    for (let i = 0; i < this.formData.outcomes.length; i++) {
      const outcome = this.formData.outcomes[i];
      if (outcome) {
        const outcomeItem = await fromUuid(outcome.uuid);
        if (!outcomeItem) {
          ui.notifications.error(`Invalid item UUID for outcome '${outcome.name}'. Please assign a valid item.`, { recipient: "gm" });
          return;
        }
        validOutcomes.push(outcome);
      }
    }

    const hideFromPlayers = formData.get('hideFromPlayers') === 'on';
    const toolTypes = await Promise.all(this.formData.tools.map(async (tool) => {
      if (!tool) return null;
      const toolItem = await fromUuid(tool.uuid);
      return toolItem?.system?.type?.baseItem || null;
    }));

    // Save the recipe
    const recipes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes'));
    const recipeId = this.recipeId || foundry.utils.randomID();
    const newRecipe = {
      id: recipeId,
      name,
      componentUuid: this.formData.component.uuid,
      componentImg: this.formData.component.img,
      outcomes: this.formData.outcomes.map(outcome => outcome ? { uuid: outcome.uuid, img: outcome.img, name: outcome.name } : null),
      toolTypes: toolTypes,
      toolUuids: this.formData.tools.map(tool => tool ? tool.uuid : null),
      toolImgs: this.formData.tools.map(tool => tool ? tool.img : null),
      toolNames: this.formData.tools.map(tool => tool ? tool.name : null),
      allowedGroups,
      isVisible: !hideFromPlayers
    };

    recipes[recipeId] = newRecipe;
    await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', recipes);

    // Update item permissions for component and outcomes
    const itemsToUpdate = [{ item: component, name: this.formData.component.name, uuid: this.formData.component.uuid }];
    for (const outcome of validOutcomes) {
      const outcomeItem = await fromUuid(outcome.uuid);
      itemsToUpdate.push({ item: outcomeItem, name: outcome.name, uuid: outcome.uuid });
    }

    for (const { item, name, uuid } of itemsToUpdate) {
      if (!item) continue;

      // Collect campaign members
      const ownershipUpdates = {};
      for (const groupId of allowedGroups) {
        const group = game.actors.get(groupId);
        if (!group) {
          ui.notifications.warn(`Campaign with ID ${groupId} not found. Skipping permission updates for this campaign.`, { recipient: "gm" });
          continue;
        }
        const members = group.system.members || [];
        if (members.length === 0) {
          ui.notifications.warn(`Campaign '${group.name}' has no members. No permissions updated for this campaign.`, { recipient: "gm" });
          continue;
        }

        for (const member of members) {
          if (member.actor?.uuid) {
            const memberActor = await fromUuid(member.actor.uuid);
            if (memberActor) {
              const owningUsers = game.users.filter(user => memberActor.testUserPermission(user, "OWNER"));
              for (const user of owningUsers) {
                const currentPermission = item.ownership[user.id] || 0;
                if (!hideFromPlayers) {
                  // Grant LIMITED if current permission is NONE
                  if (currentPermission === 0) {
                    ownershipUpdates[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
                  }
                } else {
                  // Downgrade to NONE only if current permission is LIMITED
                  if (currentPermission === 1) {
                    ownershipUpdates[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
                  }
                }
              }
            }
          }
        }
      }

      // Apply ownership updates
      try {
        if (game.user.isGM) {
          await item.update({ ownership: ownershipUpdates });
        } else {
          await game.socket.emit('module.vikarovs-guide-to-kaeliduran-crafting', {
            operation: "updateItemPermissions",
            payload: { itemUuid: uuid, ownershipUpdates }
          });
        }
      } catch (error) {
        console.error(`Error updating permissions for item '${name}':`, error);
        ui.notifications.error(`Failed to update permissions for item '${name}': ${error.message}`, { recipient: "gm" });
      }
    }

    ui.notifications.info(`Recipe "${name}" ${this.recipeId ? 'updated' : 'created'} successfully and item permissions updated.`);

    if (this.workshopInterface && typeof this.workshopInterface.render === 'function') {
      await this.workshopInterface.render({ force: true });
    }

    await this.close();
  }

  async close(options = {}) {
    this.formData = null;
    const form = this._element?.[0]?.querySelector('form');
    if (form) {
      form.querySelectorAll('.drop-zone').forEach(zone => {
        zone.removeEventListener('drop', this._handleDrop);
      });
      const saveButton = form.querySelector('.save-btn');
      if (saveButton) {
        saveButton.removeEventListener('click', this._handleSave);
      }
      const cancelButton = form.querySelector('.cancel-btn');
      if (cancelButton) {
        cancelButton.removeEventListener('click', this._handleCancel);
      }
    }
    return super.close(options);
  }
}
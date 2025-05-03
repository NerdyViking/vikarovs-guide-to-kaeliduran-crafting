const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftingGroupManager extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
  }

  static DEFAULT_OPTIONS = {
    id: "crafting-group-manager",
    classes: ["vikarovs-crafting-group-manager"],
    window: {
      title: "Crafting Campaign Manager",
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 600,
      height: "auto"
    }
  };

  static PARTS = {
    main: {
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/craftingGroupManager.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.campaigns = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups'));
    context.actors = game.actors.filter(a => a.type === "character");
    context.recipes = await this._getRecipes();

    // Fetch all party groups and filter out those already in campaigns
    const existingCampaignIds = Object.keys(context.campaigns);
    context.partyGroups = game.actors.filter(
      a => a.type === "group" && a.system.type?.value === "party" && !existingCampaignIds.includes(a.id)
    );

    // Prepare crafting memory for each campaign
    context.campaignCraftingMemory = {};
    for (const campaignId of Object.keys(context.campaigns)) {
      const campaignMemory = { Combat: new Set(), Utility: new Set(), Entropy: new Set() };
      for (const actorId of context.campaigns[campaignId].actors) {
        const actor = game.actors.get(actorId);
        if (actor) {
          const memory = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${campaignId}`) || {
            Combat: [],
            Utility: [],
            Entropy: []
          };
          for (const category of ["Combat", "Utility", "Entropy"]) {
            memory[category].forEach(sum => campaignMemory[category].add(sum));
          }
        }
      }
      context.campaignCraftingMemory[campaignId] = {
        Combat: Array.from(campaignMemory.Combat).sort((a, b) => a - b),
        Utility: Array.from(campaignMemory.Utility).sort((a, b) => a - b),
        Entropy: Array.from(campaignMemory.Entropy).sort((a, b) => a - b)
      };
    }

    return context;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.isFirstRender) {
      options.window ||= {};
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!(this.element instanceof HTMLElement)) {
      return;
    }

    const html = $(this.element);

    // Create new campaign or select party group
    html.find('.create-campaign').on('click', async (event) => {
      const selectedGroupId = html.find('select[name="select-campaign"]').val();
      if (selectedGroupId) {
        const group = game.actors.get(selectedGroupId);
        if (group) {
          const campaigns = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups'));
          campaigns[selectedGroupId] = {
            name: group.name,
            actors: group.system.members?.map(member => member.id) || [],
            isPartyGroup: true
          };
          await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups', campaigns);

          for (const actorId of campaigns[selectedGroupId].actors) {
            const actor = game.actors.get(actorId);
            if (actor) {
              await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId', selectedGroupId);
            }
          }
          this.render({ force: true });
        }
      } else {
        new Dialog({
          title: "Create New Campaign",
          content: `
            <div class="form-group">
              <label>Enter the name of the new campaign:</label>
              <input type="text" name="campaignName" autofocus />
            </div>
          `,
          buttons: {
            create: {
              label: "Create",
              callback: async (html) => {
                const campaignName = html.find('input[name="campaignName"]').val();
                if (campaignName) {
                  const campaignId = foundry.utils.randomID();
                  const campaigns = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups'));
                  campaigns[campaignId] = { name: campaignName, actors: [] };
                  await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups', campaigns);
                  this.render({ force: true });
                }
              }
            },
            cancel: {
              label: "Cancel"
            }
          },
          default: "create"
        }).render(true);
      }
    });

    // Delete campaign
    html.find('.delete-campaign').on('click', async (event) => {
      const campaignId = event.currentTarget.dataset.campaignId;
      const confirmed = await Dialog.confirm({
        title: "Delete Campaign",
        content: `<p>Are you sure you want to delete this campaign? This will also remove associated crafting memory.</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (confirmed) {
        const campaigns = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups'));
        delete campaigns[campaignId];
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups', campaigns);

        for (const actor of game.actors.filter(a => a.type === "character")) {
          await actor.unsetFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${campaignId}`);
          const actorCampaignId = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId');
          if (actorCampaignId === campaignId) {
            await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId', "");
          }
        }

        this.render({ force: true });
      }
    });

    // Reset crafting memory sum
    html.find('.reset-sum').on('click', async (event) => {
      const campaignId = event.currentTarget.dataset.campaignId;
      const category = event.currentTarget.dataset.category;
      const sum = parseInt(event.currentTarget.dataset.sum);

      const confirmed = await Dialog.confirm({
        title: "Reset Crafting Memory",
        content: `<p>Are you sure you want to remove ${sum} from ${category} for this campaign? This will mark it as unknown for players.</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (confirmed) {
        for (const actorId of game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups')[campaignId].actors) {
          const actor = game.actors.get(actorId);
          if (actor) {
            const memory = foundry.utils.deepClone(
              actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${campaignId}`) || {
                Combat: [], Utility: [], Entropy: []
              }
            );
            memory[category] = memory[category].filter(s => s !== sum);
            await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${campaignId}`, memory);
          }
        }
        this.render({ force: true });
      }
    });

    // Toggle recipe campaign access
    html.find('.toggle-recipe-campaign').on('click', async (event) => {
      const campaignId = event.currentTarget.dataset.campaignId;
      const recipeId = event.currentTarget.dataset.recipeId;
      const recipes = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes'));
      const recipe = recipes[recipeId];

      if (!recipe.allowedGroups) recipe.allowedGroups = [];
      const index = recipe.allowedGroups.indexOf(campaignId);
      if (index === -1) {
        recipe.allowedGroups.push(campaignId);
      } else {
        recipe.allowedGroups.splice(index, 1);
      }

      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes', recipes);
      this.render({ force: true });
    });

    // Handle form submission
    html.find('form').on('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const campaigns = foundry.utils.deepClone(game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups'));
      const actorsToUpdate = [];

      for (const [campaignId, campaign] of Object.entries(campaigns)) {
        if (campaign.isPartyGroup) continue;

        campaign.actors = [];
        for (const [key, value] of formData.entries()) {
          if (key.startsWith(`campaign-${campaignId}-actor-`) && value === "on") {
            const actorId = key.split('-').pop();
            campaign.actors.push(actorId);
            actorsToUpdate.push({ actorId, campaignId });
          }
        }
      }

      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'craftingGroups', campaigns);

      for (const { actorId, campaignId } of actorsToUpdate) {
        const actor = game.actors.get(actorId);
        if (actor) {
          await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId', campaignId);
        }
      }

      for (const actor of game.actors.filter(a => a.type === "character")) {
        const actorId = actor.id;
        const isAssigned = Object.values(campaigns).some(campaign => campaign.actors.includes(actorId));
        if (!isAssigned) {
          await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId', "");
        }
      }

      this.render({ force: true });
    });
  }

  async _getRecipes() {
    const recipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes');
    return Object.entries(recipes).map(([id, recipe]) => ({
      id,
      name: recipe.name,
      allowedGroups: recipe.allowedGroups || []
    }));
  }
}
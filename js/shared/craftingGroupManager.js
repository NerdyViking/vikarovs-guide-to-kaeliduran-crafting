const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftingGroupManager extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
  }

  static DEFAULT_OPTIONS = {
    id: "crafting-group-manager",
    classes: ["vikarovs-crafting-group-manager"],
    window: {
      title: "Crafting Group Manager",
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
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/craftingGroupManager.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const activeGroups = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups') || {};
    const groupActors = game.actors.filter(a => a.type === "group" && a.system.type?.value === "party");

    context.groups = await Promise.all(groupActors.map(async group => {
      // Resolve member UUIDs to actor names
      const members = group.system.members || [];
      const memberNames = await Promise.all(members.map(async member => {
        if (!member.actor || !member.actor.uuid) return null;
        const actor = await fromUuid(member.actor.uuid);
        return actor ? actor.name : null;
      }));

      return {
        id: group.id,
        name: group.name,
        members: memberNames.filter(name => name).join(", ") || "None",
        active: !!activeGroups[group.id]
      };
    }));

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

    if (!(this.element instanceof HTMLElement)) return;

    const html = $(this.element);

    html.find('.active-toggle').on('change', async (event) => {
      const groupId = event.currentTarget.dataset.groupId;
      const isActive = event.currentTarget.checked;
      const activeGroups = foundry.utils.deepClone(
        game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups') || {}
      );
      activeGroups[groupId] = isActive;
      await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups', activeGroups);
      this.render({ force: true });
    });
  }

  static init() {
    Hooks.on('updateActor', (actor) => {
      if (actor.type === 'group' && actor.system.type?.value === 'party') {
        const app = Object.values(ui.windows).find(w => w instanceof CraftingGroupManager);
        if (app) app.render({ force: true });
      }
    });

    Hooks.on('deleteActor', async (actor) => {
      if (actor.type === 'group' && actor.system.type?.value === 'party') {
        const activeGroups = foundry.utils.deepClone(
          game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups') || {}
        );
        delete activeGroups[actor.id];
        await game.settings.set('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups', activeGroups);
      }
    });
  }
}

CraftingGroupManager.init();
Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls.tokens;
  if (!tokenControls || !tokenControls.tools) {
    console.warn("Token controls or tools not found");
    return;
  }

  const getSelectedActor = async () => {
    const controlledTokens = canvas.tokens?.controlled || [];
    if (controlledTokens.length === 1) {
      const actor = controlledTokens[0].actor;
      if (actor) {
        if (!game.user.isGM) {
          const groupId = await actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId');
          if (!groupId) {
            console.warn("No groupId found for actor, cannot proceed.");
            return null;
          }
        }
        return actor;
      }
    }

    let actors = game.actors.filter(actor => actor.type === "character" && actor.testUserPermission(game.user, "OWNER"));
    if (actors.length === 0) {
      console.warn("No owned characters found for user.");
      return null;
    }

    if (game.user.isGM && actors.length > 0) {
      return actors[0];
    }

    const selectedActor = actors[0];
    if (!game.user.isGM) {
      const groupId = await selectedActor.getFlag('vikarovs-guide-to-kaeliduran-crafting', 'groupId');
      if (!groupId) {
        console.warn("No groupId found for assigned character, cannot proceed.");
        return null;
      }
    }

    return selectedActor;
  };

  const craftingButtons = {
    cauldron: {
      name: "cauldron",
      title: "Cauldron",
      icon: "fas fa-flask",
      visible: true,
      onChange: async () => {
        const actor = await getSelectedActor();
        if (!actor) return;

        const { AlchemyInterface } = await import('../alchemy/alchemyInterface.js');
        new AlchemyInterface(actor).render(true);
      },
      button: true
    },
    workshop: {
      name: "workshop",
      title: "Workshop",
      icon: "fas fa-hammer",
      visible: true,
      onChange: async () => {
        const actor = await getSelectedActor();
        if (!actor) return;

        const { WorkshopInterface } = await import('../workshop/workshopInterface.js');
        new WorkshopInterface(actor).render(true);
      },
      button: true
    },
    groupManager: {
      name: "groupManager",
      title: "Group Manager",
      icon: "fas fa-users",
      visible: game.user.isGM,
      onChange: async () => {
        const { CraftingGroupManager } = await import('../shared/craftingGroupManager.js');
        new CraftingGroupManager().render(true);
      },
      button: true
    },
    itemConfiguration: {
      name: "itemConfiguration",
      title: "Item Configuration",
      icon: "fas fa-cog",
      visible: game.user.isGM,
      onChange: async () => {
        const { ItemConfigurationDialog } = await import('../shared/itemConfigurationDialog.js');
        new ItemConfigurationDialog().render(true);
      },
      button: true
    }
  };

  for (const [key, button] of Object.entries(craftingButtons)) {
    if (button.visible) {
      tokenControls.tools[key] = button;
    }
  }
});
Hooks.on('getSceneControlButtons', (controls) => {

  // Access the tokens control group directly
  const tokenControls = controls.tokens;
  if (!tokenControls || !tokenControls.tools) {
    console.warn("Token controls or tools not found");
    return;
  }

  // Define our custom buttons as an object to merge into tools
  const craftingButtons = {
    cauldron: {
      name: "cauldron",
      title: "Cauldron",
      icon: "fas fa-flask",
      visible: true,
      onChange: () => {
        ui.notifications.info("Cauldron button clicked!");
      },
      button: true
    },
    workshop: {
      name: "workshop",
      title: "Workshop",
      icon: "fas fa-hammer",
      visible: true,
      onChange: () => {
        ui.notifications.info("Workshop button clicked!");
      },
      button: true
    },
    groupManager: {
      name: "groupManager",
      title: "Group Manager",
      icon: "fas fa-users",
      visible: game.user.isGM, // GM-only
      onChange: () => {
        ui.notifications.info("Group Manager button clicked!");
      },
      button: true
    }
  };

  // Merge the crafting buttons into the token controls tools object
  for (const [key, button] of Object.entries(craftingButtons)) {
    if (button.visible) {
      tokenControls.tools[key] = button;
    }
  }
});
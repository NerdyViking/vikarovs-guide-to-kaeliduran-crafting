// js/harvest/reagentTableButton.js
// Import utils and ensure our module files are loaded in the correct order
import '../shared/utils.js';

// Pre-load the reagentTableEditor to avoid dynamic import issues
import { ReagentTableEditor } from './reagentTableEditor.js';

/**
 * Adds a button to the RollTable directory to access the reagent table editor.
 * The button is only visible to GMs.
 */

Hooks.on('renderSidebarTab', (app, html) => {
  // Only proceed if this is the RollTable directory and user is GM
  if (app.tabName !== "tables" || !game.user.isGM) return;

  // Find the header actions div where the create buttons are
  const headerActions = html.find('.directory-header .header-actions');
  if (!headerActions.length) return;

  // Create the button with icon and label
  const button = $(`
    <button type="button" class="reagent-tables-button">
      <i class="fas fa-flask"></i> Harvest/Loot Tables
    </button>
  `);

  // Add click handler to open the reagent table editor
  button.on('click', (event) => {
    event.preventDefault();
    try {
      const editor = new ReagentTableEditor();
      editor.render(true);
    } catch (error) {
      console.error("Failed to open Reagent Table Editor:", error);
      ui.notifications.error("Failed to open Reagent Table Editor");
    }
  });

  // Add the button to the header actions, after the other buttons
  headerActions.append(button);
});
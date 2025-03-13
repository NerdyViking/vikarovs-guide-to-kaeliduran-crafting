# Vikarov's Guide to Kaeliduran Crafting

A modular crafting system for Foundry VTT, featuring alchemy and future magic item crafting.

## Installation
- Install via Foundry VTT module browser or manually by adding the module URL to your setup.

## Development
- This module is under active development with a modular structure:
  - `js/shared/`: Shared utilities and button logic.
  - `js/alchemy/`: Alchemy-specific interface and logic.
  - `js/workshop/`: Workshop-specific interface and logic (future).
  - `css/`: Styles for each component.
  - `templates/`: Handlebars templates.

## Phases
### Phase 1: Reagent Tables System

- **Step 1:** Define module settings and data structure for reagent tables
- **Step 2:** Create button in GM UI to access the reagent table editor
- **Step 3:** Build skeleton UI for reagent table editor dialog
- **Step 4:** Implement table creation, editing, and deletion functionality
- **Step 5:** Add drag-and-drop for reagent slots with weight controls
- **Step 6:** Implement reagent rolling logic and testing

### Phase 2: NPC Configuration

- **Step 1:** Add header button to NPC sheets
- **Step 2:** Create configuration dialog UI
- **Step 3:** Implement saving of NPC reagent settings as flags
- **Step 4:** Add table filtering based on tags
- **Step 5:** Test configuration with different NPC types

### Phase 3: Combat End Conversion

- **Step 1:** Create hook into deleteCombat event
- **Step 2:** Add dialog for showing defeated creatures
- **Step 3:** Implement token conversion logic (harvestable/lootable)
- **Step 4:** Add visual indicators for converted tokens
- **Step 5:** Test with multiple defeated creatures

### Phase 4: Harvesting Mechanics

- **Step 1:** Add double-click handler for harvestable tokens
- **Step 2:** Implement skill check determination based on creature type
- **Step 3:** Create DC calculation and success tier logic
- **Step 4:** Implement reagent award system with inventory updates
- **Step 5:** Add depletion state for harvested tokens

### Phase 5: Looting Interface

- **Step 1:** Create loot dialog UI
- **Step 2:** Implement item display and transfer to player inventory
- **Step 3:** Add special handling for reagents in loot
- **Step 4:** Test multi-player looting scenarios

### Phase 6: Styling and Polish

- **Step 1:** Design and implement CSS for all dialogs
- **Step 2:** Create token overlays/indicators for different states
- **Step 3:** Add animations and visual feedback
- **Step 4:** Optimize performance and ensure responsive UI

### Phase 7: Documentation and Testing

- **Step 1:** Create user documentation for GMs
- **Step 2:** Implement error handling and edge cases
- **Step 3:** Conduct thorough testing with various scenarios
- **Step 4:** Optimize and refine based on testing feedback
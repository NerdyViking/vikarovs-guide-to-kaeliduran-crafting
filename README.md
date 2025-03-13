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

## Phase 3: Combat End Conversion

### Overview

Phase 3 will implement the conversion of defeated creatures into interactive remains that players can harvest for reagents or loot for items. Instead of modifying the original tokens, we'll replace them with tiles that represent the remains of defeated creatures. This approach provides a cleaner solution with better visual feedback and user experience.

### File Structure Changes

We've reorganized the file structure to better reflect our tile-based approach:

#### JavaScript Files

- **js/harvest/convertDefeat.js**: Handles both automated conversion of defeated tokens to tiles and provides a GM sidebar button for manual conversion
- **js/harvest/harvestableInterface.js**: Manages the dialog and skill check interactions for harvestable remains
- **js/harvest/lootableInterface.js**: Manages the dialog and inventory transfer logic for lootable remains
- **js/harvest/remainsManager.js**: Provides shared utilities for tracking and managing remains tiles
- **js/harvest/tileInteraction.js**: Hooks into tile click events and routes to the appropriate interface

#### Template Files

- **templates/convertDefeatDialog.hbs**: Dialog for manual token conversion
- **templates/harvestableInterface.hbs**: Interface for harvesting reagents from remains
- **templates/lootableInterface.hbs**: Interface for looting items from remains

#### CSS Files

- **css/remainsInterface.css**: Styles for the harvesting and looting dialogs
- **css/remainsStyle.css**: Styles for tile overlays and visual indicators

### Updated Implementation Steps

#### Step 1: Combat End Detection and Conversion

- Implement hooks into the `deleteCombat` event to detect when a combat encounter ends
- Identify defeated creatures (HP = 0 or custom defeat markers)
- Create a dialog showing all defeated creatures with their configured type (harvestable or lootable)
- Allow the GM to select which creatures to convert to remains
- Implement automatic conversion based on module settings (optional confirmation dialog)
- Create a sidebar button for GMs to manually convert selected tokens outside of combat

#### Step 2: Remains Creation

- Create Tile objects to represent the remains of defeated creatures
- Position tiles at the location of the defeated token
- Apply visual styling to differentiate harvestable vs. lootable remains
- Store references to the original creature data (including configured reagent tables and loot)
- Remove the original token from the scene
- Register the newly created remains in a tracker system

#### Step 3: Tile Interaction System

- Implement hooks into tile click events
- Determine if a clicked tile is a remains tile
- Check if the remains have already been harvested/looted
- Route to the appropriate interface based on the remains type (harvestable or lootable)
- Show appropriate warnings if remains have already been depleted

#### Step 4: Harvestable Interface

- Create a dialog showing information about the harvestable creature
- Display the required skill check and DC
- Implement a button to initiate the harvesting attempt
- Use the Foundry and D&D 5e roll mechanics to perform the skill check
- Award reagents based on success tiers and the configured reagent table
- Update the remains to a depleted state
- Prevent further harvesting attempts

#### Step 5: Lootable Interface

- Create a dialog showing items available for looting
- Display items from the creature's inventory and generated reagents
- Implement buttons to take individual items or all items
- Transfer items to the player's inventory when taken
- Remove items from the loot list once taken
- Update the remains to a depleted state when all items are taken

#### Step 6: Remains Management

- Implement a system to track all remains on the scene
- Provide visual indicators for available and depleted remains
- Ensure multiple players can view the same remains simultaneously
- Update all open interfaces when remains status changes
- Implement permission checks for appropriate access control

#### Step 7: Testing and Edge Cases

- Test with multiple defeated creatures of different types
- Test with multiple players accessing the same remains
- Handle edge cases such as:
    - Scene changes while dialogs are open
    - Token deletion outside of regular combat flow
    - Permission issues with different user roles
    - Synchronization when multiple players interact simultaneously

### Technical Considerations

- Use Foundry's Tile APIs for creating and managing remains
- Store remains data as flags on the tile object
- Use Hooks.on("clickTile") to detect interaction
- Implement socket events for multi-user synchronization
- Use the D&D 5e system's native roll mechanics for skill checks
- Ensure compatibility with token vision and lighting systems
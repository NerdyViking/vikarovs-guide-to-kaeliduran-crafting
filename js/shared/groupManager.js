import { isComponent, isReagent } from './utils.js';

export class GroupManager {
  static getActiveGroups() {
    const activeGroups = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups') || {};
    return game.actors.filter(
      a => a.type === 'group' && a.system.type?.value === 'party' && activeGroups[a.id]
    );
  }

  static async getActorGroups(actorId) {
    const groupActors = game.actors.filter(
      a => a.type === 'group' && a.system.type?.value === 'party'
    );

    const groups = [];
    for (const group of groupActors) {
      const members = group.system.members || [];
      for (const member of members) {
        if (!member.actor || !member.actor.uuid) continue;
        const memberActor = await fromUuid(member.actor.uuid);
        if (memberActor && memberActor.id === actorId) {
          groups.push(group);
          break; // No need to check more members in this group
        }
      }
    }

    return groups;
  }

  static getRecipesForGroup(groupId) {
    const recipes = game.settings.get('vikarovs-guide-to-kaeliduran-crafting', 'workshopRecipes');
    return Object.values(recipes).filter(recipe => recipe.allowedGroups?.includes(groupId));
  }

  static async getCraftingMemory(actor, groupId) {
    const memoryFlag = `craftingMemory.${groupId}`;
    let memory = actor.getFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag);
    if (!memory) {
      memory = { Combat: [], Utility: [], Entropy: [] };
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', memoryFlag, memory);
    }
    return memory;
  }

  static async setCraftingMemory(actor, groupId, category, sum) {
    const memory = await this.getCraftingMemory(actor, groupId);
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    if (!memory[capitalizedCategory].includes(sum)) {
      memory[capitalizedCategory].push(sum);
      await actor.setFlag('vikarovs-guide-to-kaeliduran-crafting', `craftingMemory.${groupId}`, memory);
    }
  }

  static async isItemValidForCrafting(item, type) {
    if (type === 'component') return isComponent(item);
    if (type === 'reagent') return isReagent(item);
    if (type === 'tool') return item.type === 'tool';
    if (type === 'outcome') return true;
    return false;
  }
}

Hooks.once('init', () => {
  game.settings.register('vikarovs-guide-to-kaeliduran-crafting', 'activeGroups', {
    name: 'Active Crafting Groups',
    hint: 'Stores which group actors are active for crafting.',
    scope: 'world',
    config: false,
    type: Object,
    default: {}
  });
});
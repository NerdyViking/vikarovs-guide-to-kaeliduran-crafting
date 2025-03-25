import { upgradeWorkshop, switchWorkshopType, gmAddExp, gmResetTier, gmResetType } from './workshopUpgrades.js';

export class WorkshopUpgradesDialog extends Application {
  constructor(actor, options = {}) {
    super(options);
    this._actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "workshop-upgrades-dialog",
      title: "Workshop Upgrades",
      template: "modules/vikarovs-guide-to-kaeliduran-crafting/templates/workshopUpgradesDialog.hbs",
      width: 400,
      height: 400
    });
  }

  async getData() {
    const data = await super.getData();
    const workshopData = this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || {
      tier: 1,
      type: "standard",
      exp: 0,
      knownRunes: [],
      runeSwapCharge: true
    };
    data.tier = workshopData.tier;
    data.type = workshopData.type;
    data.exp = workshopData.exp;
    data.expNeeded = workshopData.tier * 5; // Exp needed for current tier (cumulative)
    data.nextTier = Math.min(workshopData.tier + 1, 5); // Cap at Tier 5
    data.nextTierCost = [0, 800, 8000, 80000, 400000][data.nextTier] || 0; // Gold cost for next tier
    data.nextTierExp = data.nextTier * 5; // Exp needed for next tier
    data.types = ["standard", "primal", "fey", "eldritch"];
    data.canUpgrade = workshopData.tier < 5; // Can't upgrade past Tier 5
    data.isGM = game.user.isGM;
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Upgrade Tier button
    html.find('.upgrade-btn').on('click', async () => {
      const workshopData = this._actor.getFlag("vikarovs-guide-to-kaeliduran-crafting", "workshopData") || { tier: 1 };
      if (await upgradeWorkshop(this._actor, workshopData.tier + 1)) {
        this.render(true);
      }
    });

    // Type selection dropdown
    html.find('.type-select').on('change', async (event) => {
      const newType = event.target.value;
      if (await switchWorkshopType(this._actor, newType)) {
        this.render(true);
      }
    });

    // GM-only buttons
    if (game.user.isGM) {
      // Add/Subtract Exp button
      html.find('.gm-modify-exp').on('click', async () => {
        const amount = parseInt(html.find('.gm-exp-input').val()) || 0;
        if (amount === 0) {
          ui.notifications.warn("Please enter a non-zero amount of exp to add or subtract.");
          return;
        }
        if (await gmAddExp(this._actor, amount)) {
          this.render(true);
        }
      });

      // Reset Tier button
      html.find('.gm-reset-tier').on('click', async () => {
        if (await gmResetTier(this._actor)) {
          this.render(true);
        }
      });

      // Reset Type button
      html.find('.gm-reset-type').on('click', async () => {
        if (await gmResetType(this._actor)) {
          this.render(true);
        }
      });
    }
  }
}
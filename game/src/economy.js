// Money: one wallet per match, spent in the buy phase, earned by kills, plants and
// round results. Kevlar is bought per round and halves nothing: it cuts incoming
// damage by 30% until the round ends.
import { WEAPONS, GRENADE_PRICE } from './weapons.js';

export const BUY_ITEMS = [
  { key: 'rifle', name: 'LR-7 Longshot', price: WEAPONS.rifle.price, desc: 'Auto rifle, 30 rounds, headshots x4' },
  { key: 'smg', name: 'KX-9 Whisper', price: WEAPONS.smg.price, desc: 'Fast SMG, 25 rounds, close range' },
  { key: 'grenade', name: 'Frag grenade', price: GRENADE_PRICE, desc: 'Arcing throw, 6 m blast' },
  { key: 'kevlar', name: 'Kevlar vest', price: 650, desc: 'Takes 30% off incoming damage' },
];

export const REWARDS = {
  kill: 300,
  roundWin: 325,
  roundLoss: 1400,
  plant: 300,
};

export function createEconomy() {
  const state = { money: 800, kevlar: false };

  return {
    state,
    resetMatch() {
      state.money = 800;
      state.kevlar = false;
    },
    resetRound() {
      state.kevlar = false;
    },
    canAfford(price) {
      return state.money >= price;
    },
    buy(item) {
      if (state.money < item.price) return { ok: false, reason: 'Not enough money' };
      if (item.key === 'kevlar' && state.kevlar) return { ok: false, reason: 'Kevlar already worn' };
      state.money -= item.price;
      if (item.key === 'kevlar') state.kevlar = true;
      return { ok: true };
    },
    reward(amount) {
      state.money += amount;
    },
  };
}

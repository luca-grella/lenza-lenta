// Baits. Worm and bread are free and unlimited; the others are consumables bought in packs at the Bottega.
// price: coins per pack; pack: units per pack (one unit is used per cast that gets a bite, see BALANCE.md).
// attracts: habitats where this bait shines (bite wait x0.85 there) — purely a hint for players/UI too.
// rarityMult: multiplier on the species weight by rarity (missing = 1).
// matchesRarity: the bait also counts as "liked" by every species of these rarities (golden lure: every fish notices it,
//   rarityMult then makes the rare ones far more likely).
// nightBonus: bait meant for the dark; outside the cave it only really works at night (Gameplay may lengthen day waits).
// biteSpeed: multiplier on the waiting time before a bite (lower = faster).  nightBonus: extra x at night.
// model: colours for the bait mesh on the hook / icon.  Names: i18n `item.<id>.name` / `.desc`.

const baits = [
  { id: 'bait_worm', free: true, price: 0, pack: 0, attracts: ['pond', 'river', 'shore'], rarityMult: {}, biteSpeed: 1,
    model: { shape: 'worm', color: '#d27a72', accent: '#a8524c' } },
  { id: 'bait_bread', free: true, price: 0, pack: 0, attracts: ['pond', 'harbor', 'shore'], rarityMult: { common: 1.1 }, biteSpeed: 0.95,
    model: { shape: 'bread', color: '#f2dcaa', accent: '#c89a5a' } },
  { id: 'bait_corn', price: 12, pack: 10, attracts: ['pond', 'river'], rarityMult: { uncommon: 1.15, rare: 1.1 }, biteSpeed: 1,
    model: { shape: 'corn', color: '#f8d040', accent: '#e0a820' } },
  { id: 'bait_shrimp', price: 25, pack: 10, attracts: ['harbor', 'shore', 'reef', 'deep'], rarityMult: { uncommon: 1.2, rare: 1.1 }, biteSpeed: 0.9,
    model: { shape: 'shrimp', color: '#f4a080', accent: '#e06a4a' } },
  { id: 'bait_fly', price: 30, pack: 10, attracts: ['river'], rarityMult: { uncommon: 1.25, rare: 1.15 }, biteSpeed: 0.9,
    model: { shape: 'fly', color: '#5a7a3a', accent: '#e8c050' } },
  { id: 'bait_squid', price: 50, pack: 8, attracts: ['deep', 'harbor'], rarityMult: { common: 0.7, rare: 1.3, epic: 1.25 }, biteSpeed: 1.05,
    sizeMult: 1.1, unlock: { quest: 'q_trout' }, model: { shape: 'squid', color: '#f2e2e6', accent: '#c87a8a' } },
  { id: 'bait_firefly', price: 60, pack: 6, attracts: ['cave', 'deep'], rarityMult: { uncommon: 1.2, rare: 1.3, epic: 1.3 }, biteSpeed: 0.9,
    nightBonus: 1.3, glow: '#e8ff7a', unlock: { quest: 'q_ettore' },
    model: { shape: 'firefly', color: '#3a3a2a', accent: '#e8ff7a' } },
  { id: 'bait_golden', price: 300, pack: 3, attracts: ['reef', 'deep', 'pond', 'river', 'cave', 'shore', 'harbor'],
    rarityMult: { common: 0.35, uncommon: 0.8, rare: 1.6, epic: 1.9, legendary: 1.5 }, matchesRarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    biteSpeed: 1.15, glow: '#ffe27a', unlock: { quest: 'q_reef' },
    model: { shape: 'lure', color: '#f5c542', accent: '#fff2b0' } },
];

for (const b of baits) {
  b.kind = 'bait';
  b.free = !!b.free;
  b.nameKey = `item.${b.id}.name`;
  b.descKey = `item.${b.id}.desc`;
}

export default baits;

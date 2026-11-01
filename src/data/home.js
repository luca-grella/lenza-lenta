// Player home tiers at Home Beach (visible in the world). Upgrades are bought from Tonio.
// price + needs (items consumed). slots: decor slots available at this tier, '<type>_<n>' (type = decor.slot).
// bed: sleeping animation/prop hint. model: hints for World (size in units, colours).
// Names: i18n `item.<id>.name` / `.desc`.

const home = [
  { id: 'home_tent', tier: 0, price: 0, owned: true,
    slots: ['porch_1', 'garden_1'], bed: 'bedroll',
    model: { kind: 'tent', size: [3, 2.2, 3], cloth: '#e8d8a8', trim: '#c8623b', wood: '#b07a4a' } },
  { id: 'home_cabin', tier: 1, price: 1500, needs: { ing_driftwood: 10 }, unlock: { quest: 'q_boat' },
    slots: ['porch_1', 'porch_2', 'garden_1', 'floor_1', 'wall_1', 'table_1'], bed: 'bed',
    model: { kind: 'cabin', size: [5, 3.5, 4.5], walls: '#b07a4a', roof: '#7d3d24', trim: '#f2e2b0' } },
  { id: 'home_cottage', tier: 2, price: 4500, needs: { ing_driftwood: 20, ing_shell: 10 }, unlock: { quest: 'q_lighthouse' },
    slots: ['porch_1', 'porch_2', 'porch_3', 'garden_1', 'garden_2', 'floor_1', 'floor_2', 'wall_1', 'wall_2', 'table_1', 'table_2'],
    bed: 'double_bed',
    model: { kind: 'cottage', size: [7, 4.5, 6], walls: '#f2e2c8', roof: '#b8623b', trim: '#3fa8b8', wood: '#8a5532' } },
];

for (const h of home) {
  h.kind = 'home';
  h.nameKey = `item.${h.id}.name`;
  h.descKey = `item.${h.id}.desc`;
}

export default home;

// Zones of the archipelago (positions/shapes are World's job). Names: i18n `zone.<id>.name` / `.desc`.
// music: mood override for ctx.audio.setMusic (null = follow time of day / weather).
// ambient: layer volumes 0..1 for ctx.audio.setAmbient while inside (birds/crickets are scaled by day/night by Audio:
//   'birds' is silenced at night and 'crickets' by day). habitats: fishing habitats found there.
// boatOnly: reachable only by rowboat. needs: item required to enter/fish (sea cave → lantern).
// mapColor: tint for the zone label on the Map.

const zones = [
  { id: 'home_beach', music: null, ambient: { waves: 0.7, birds: 0.4, crickets: 0.4, wind: 0.2 },
    habitats: ['shore'], mapColor: '#f2d58a' },
  { id: 'village', music: null, ambient: { waves: 0.5, birds: 0.5, crickets: 0.3, wind: 0.15 },
    habitats: ['harbor', 'shore'], mapColor: '#e8a070' },
  { id: 'pine_forest', music: null, ambient: { river: 0.6, birds: 0.8, crickets: 0.6, wind: 0.35 },
    habitats: ['river'], mapColor: '#4a9a5a' },
  { id: 'waterfall', music: null, ambient: { waterfall: 0.9, birds: 0.5, crickets: 0.5, wind: 0.1 },
    habitats: ['pond', 'river'], mapColor: '#6ac8d8' },
  { id: 'meadow', music: null, ambient: { birds: 0.9, crickets: 0.8, wind: 0.5 },
    habitats: ['river'], mapColor: '#9ad06a' },
  { id: 'lighthouse', music: null, ambient: { waves: 0.9, wind: 0.6, birds: 0.3 },
    habitats: ['deep', 'shore'], mapColor: '#d8d8e0' },
  { id: 'sea_cave', music: 'cave', ambient: { waves: 0.35, waterfall: 0.1 },
    habitats: ['cave'], needs: 'lantern', mapColor: '#7a8ad8' },
  { id: 'palm_islet', music: null, ambient: { waves: 0.8, birds: 0.5, wind: 0.4, crickets: 0.3 },
    habitats: ['reef', 'shore', 'deep'], boatOnly: true, mapColor: '#f8e0a0' },
  { id: 'turtle_isle', music: null, ambient: { waves: 0.8, birds: 0.3, wind: 0.5 },
    habitats: ['shore', 'deep'], boatOnly: true, mapColor: '#c8e0a0' },
];

for (const z of zones) {
  z.nameKey = `zone.${z.id}.name`;
  z.descKey = `zone.${z.id}.desc`;
}

export default zones;

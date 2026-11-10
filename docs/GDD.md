# Lenza Lenta — Game Design Document

Cozy 3D fishing game in the browser, installable as an iPhone PWA. Successor of v1
(https://luca-grella.github.io/lenza-lenta/, single file, kept untouched). Reference mood: the
"cozy fishing game made with Unity 6 + Blender" seen on Threads: soft daylight, turquoise
shallow water fading to deep blue, foam on the shore, swaying palms and pines, waterfall,
wooden docks and huts on stilts, top-down three-quarter camera, a chunky cartoon fisherman
with a big straw hat. **Everything is made in code** (no downloaded models): procedural meshes,
real skeletons (THREE.Bone/SkinnedMesh) with hand-authored keyframe clips + procedural layers.

## Pillars
1. **Slow and cozy.** Nothing rushes the player. Walk speed ~3 u/s, smooth camera with gentle
   easing, long soft transitions, bites come after a calm wait, the reel minigame is forgiving,
   failure is gentle ("it slipped away" + small shrug animation), no timers or penalties.
   Ambient generative music, birds by day, crickets at night, waves, rain on leaves.
2. **Looks hand-crafted, "Unity-like".** Stylized lighting, depth-colored water with animated
   foam and caustics, wind on every plant, soft shadows, subtle bloom, tilt-shift miniature
   blur at the screen edges, warm color grading, day/night and weather that change the mood.
3. **Every action has its own animation.** Casting, waiting, striking, reeling, lifting the
   catch, rowing, sitting on the dock, crouching to forage, petting the cat, eating, sleeping,
   yawning when idle. Creatures animate too (fish bend their spine, the cat walks and sits).
4. **Lots to discover, at your own pace.** A big archipelago, 45+ fish and creatures tied to
   place, time and weather, collections, upgrades, villagers with requests.
5. **A real app on iPhone.** Full-screen PWA, no zoom/selection glitches, portrait and
   landscape, safe areas respected, everything fits on screen, works offline, IT/EN.

## World — "Arcipelago di Porto Lento"
Terrain heightfield ~320 x 320 world units (1 unit ≈ 1 m), sea all around (fog hides the edge).
Main island radius ~85 u plus two islets reached by rowboat. Zones (ids are used in code/data):

| id | Name IT / EN | Content |
|---|---|---|
| `home_beach` | Spiaggia di Casa / Home Beach | Spawn. Player's cabin (upgradable), small dock, campfire, bench. |
| `village` | Porto Lento / Slow Harbor | Harbor with long docks and boats, 4-5 houses, shops on stilts: Bait & Tackle (Bottega), Fishmonger (Pescheria, sell), Carpenter (Falegname: boat, house, furniture), Cook (Trattoria: recipes), Aquarium building. Lanterns at night. NPCs. |
| `pine_forest` | Bosco dei Pini / Pine Woods | Dense pines, mushrooms, berries, a winding **river** from the hills to the sea with a wooden bridge and stepping stones. |
| `waterfall` | Cascata / Waterfall Pond | Cliff, big waterfall with mist, pond with lily pads and frogs (v1 homage, much richer). |
| `meadow` | Prato dei Fiori / Flower Meadow | Rolling hills, flowers, butterflies, a windmill or old tree, view point. |
| `lighthouse` | Scogliera del Faro / Lighthouse Cliffs | Rocky cliffs, lighthouse (beam at night), deep sea fishing spot, seagulls. |
| `sea_cave` | Grotta Marina / Sea Cave | Cave on the coast, glowing pool (bioluminescent at night), needs the lantern. |
| `palm_islet` | Isolotto delle Palme / Palm Islet | Coconuts, white sand, **coral reef** garden around it. Boat only. |
| `turtle_isle` | Isola delle Tartarughe / Turtle Isle | Tiny islet with turtles, rare open-sea fish, a hidden treasure chest. Boat only. |

Fishing habitats (data uses these ids): `pond`, `river`, `shore` (shallow sea), `harbor`,
`deep` (open sea, depth > ~3 m or from boat), `reef`, `cave`.
Time phases: `dawn` (5-8), `day` (8-18), `dusk` (18-21), `night` (21-5). One game day = 24 real
minutes by default (1 game hour = 1 real minute). Sleeping in the cabin skips to dawn.
Weather: `clear`, `cloudy`, `rain`, `fog` (rare `storm`-lite: heavy rain + wind, still cozy).
Weather changes every few game hours with soft transitions and affects which fish bite.

## Fish & creatures
- **45+ fishable species** across habitats, plus ~6 junk/treasure catches (boot, bottle with a
  message, old coin, crown?, etc.). Each species: rarity (common/uncommon/rare/epic/legendary),
  size range (cm), base price, preferred baits, active time phases, weather bonus, behaviour in
  the minigame (`calm`, `darter`, `heavy`, `jumper`, `zigzag`), 3D model params (body shape,
  palette, pattern, fins) so the Creatures module can build a unique mesh for each.
  At least 3 legendary fish (one per special place/time: e.g. waterfall at dawn in rain,
  lighthouse at night, reef with golden bait).
- **Ambient creatures** (not caught; animated): cat companion (befriend by feeding fish, then it
  follows you and sits next to you while you fish), seagulls (fly, land on posts, steal-a-fish
  joke), crabs on beaches, turtles (swim near turtle isle, sunbathe), frogs on lily pads,
  butterflies (day), fireflies (night), dolphins jumping far at sea (rare), deer or rabbits in the
  forest, jellyfish glowing in the cave at night.

## Activities
1. **Fishing** from shore, docks and boat. Flow: aim (ring preview) → hold to charge, release to
   cast (windup + release animation, line arc) → calm wait, nibbles → bite (bobber plunge, "!" and
   haptic where available) → strike → **reel minigame**: hold to reel, release when the fish
   pulls; tension arc + distance meter; behaviour patterns per species; rod/reel/line upgrades
   change tolerances; gentle → catch card with 3D turntable of the fish, size, rarity, "new!"
   / "record!". Keep, release (small reward of goodwill), or give to the cat.
2. **Rowboat**: repair it at the carpenter (quest), then board at docks; row with the joystick
   (rowing animation, wake, gentle bob). Fishing from the boat reaches `deep` and `reef`.
3. **Aquarium** (in the village): donate one of each species; donated fish appear swimming in tanks
   in the aquarium building and in the Aquarium panel; milestones give rewards.
4. **Cooking** at the Trattoria or the home campfire: recipes combine fish + foraged ingredients;
   eating a dish gives a soft, timed buff (luck, bigger fish, calmer fish, faster reel).
5. **Foraging**: shells on beaches, berries and mushrooms in the forest, herbs in the meadow,
   coconuts on the palm islet (crouch-and-pick animation, respawn daily).
6. **Villagers & requests**: 5-6 villagers with names, looks and short dialogues (IT/EN). Story
   quest chain (~15 steps: learn to fish → sell → buy shrimp → repair boat → reach islets →
   light the lighthouse → legendary fish) + rotating daily requests ("bring me 2 mackerel").
7. **Home**: cabin upgrades in 3 tiers (tent → cabin → cottage, visible in the world), bed to
   sleep, a few furniture/decor items bought from the carpenter placed in fixed slots.
8. **Rest moments**: sit on benches/dock edges (legs dangle), watch sunset; idle yawns.

## Progression & upgrades
- Rods (5): Bamboo → Sturdy → Carbon → Master → Legendary (cast distance, reel power).
- Reels (3): tension tolerance / recovery. Lines (3): break threshold.
- Baits (8): worm, bread, corn, shrimp, squid, fly (river), firefly (night), golden lure (rare+).
  Free unlimited: worm, bread. Others are bought in packs (consumable) — cheap, cozy economy.
- Basket capacity: 8 → 12 → 18 → 24. Lantern (cave + night bonus). Boat speed upgrade.
- House tiers and decor. Cat collar (cosmetic). Hat colours (cosmetic).
- Currency: coins ("monete"). Prices tuned so the main chain completes in ~2-3 hours of play and
  the full collection in many more.

## UI / UX
- First launch: language picker (Italiano / English), then a short cozy intro and onboarding
  tips that appear in context. Language changeable any time in Settings.
- HUD: top-left current goal; top-right coins, basket, time-of-day clock + weather icon, menu;
  bottom: virtual joystick (drag anywhere on the left part of the screen) and a big context
  action button (Cast / Release / Strike / Reel / Talk / Pick / Board / Sit…), bait selector.
- Menus (sheets): Journal (species grid, silhouettes for unknown, hints), Aquarium, Inventory &
  baits, Quests, Map (drawn from the heightmap, zone names, player marker), Settings (language,
  music/sfx volume, graphics quality auto/low/mid/high, haptics, reset save).
- Shops: Bottega (baits, rods, reels, lines, basket, lantern), Pescheria (sell), Falegname
  (boat, house, decor), Trattoria (recipes, cook).
- Desktop: WASD/arrows, Space (action), E (interact), B (bait), J (journal), M (map), Esc.

## Platform requirements (iPhone first)
PWA manifest + service worker (offline, versioned cache), apple-touch-icon, standalone display,
`viewport-fit=cover` + safe-area insets everywhere, no pinch/double-tap zoom, no text selection
or callouts, no rubber-band scroll, portrait AND landscape layouts (short-height landscape gets a
compact HUD), every overlay fits the viewport (scroll inside the sheet if needed), 60 fps target
on recent iPhones with automatic quality tiers, pauses when hidden, saves on `pagehide`.

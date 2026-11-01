# Lenza Lenta 2 — Balance notes (Content)

Numbers live in `src/data/*.js`; this note explains the intent so other areas (Gameplay, UI) tune in
the same direction. Re-check with `node --experimental-detect-module tmp/content/validate.mjs` (data
integrity) and `tmp/content/tables.mjs` (bite tables + Monte Carlo coins per catch). Both scripts are
local and git-ignored, so copy them from a teammate or rewrite them if `tmp/` is empty.

## Time scale
1 game hour = 1 real minute (`ctx.time.scale = 60`). Dawn 3 min, day 10 min, dusk 3 min, night 8 min.
Weather changes every few game hours, so a "rainy dawn" comes roughly every 4-6 game days.

## How a bite is chosen (`ctx.data.helpers.biteTable`)
1. Candidates = species whose `habitats` include the habitat, `zones` (if any) include the zone, `times`
   include the phase, the current bait is in `baits` (the golden lure matches everything), all `special`
   conditions hold (legendaries), and `weather[w] ≠ 0`.
2. weight = `RARITY[r].weight` (common 100, uncommon 38, rare 12, epic 4, legendary 25)
   × weather multiplier × `bait.rarityMult[r]` × (1 + luck × rarityIndex × 1.5) × firefly night bonus.
   Legendaries already in the Journal × 0.15 (no farming).
3. Junk is added with weight ≈ `chance` × the total fish weight (≈ 6-8 % of bites, unique junk only once).
4. Size: `rollSize` is skewed small (t^1.6); `priceFor` = base × (0.7 … 1.3) by size.

Guarantees checked by the validator:
- Every habitat, at every phase and in every weather, has at least one **common** biting on **worm or bread**.
- Every bait catches real fish (not just junk) in each habitat it advertises (`attracts`), at every
  phase (firefly is a night bait outside the cave).
- Every species, legendaries included, can actually be caught somewhere.
- 5 legendaries, 4 of them with place + time + weather + bait (Lumina needs place + night + bait + lantern).

Per-bite legendary odds when all conditions hold (first time): Dawn Koi ≈ 10 % with corn,
Granny Trout ≈ 5 % with a fly, Old Grumbler ≈ 13 % with squid, Rainbow King ≈ 12 % with the golden
lure (its only bait), Lumina ≈ 12 % with firefly bait. With ~3 bites per dawn/dusk and ~8 per night,
that is roughly one legendary every 1-3 suitable windows: rare, but never a grind.

## Reel minigame
`difficulty` 0..1 per species + `constants.BEHAVIORS` presets (pull, bursts, rest, jumps, swerve,
stamina). Suggested mapping: max fish pull = behaviour.pull × (0.6 + difficulty) ÷ (rod.power ×
reel.tolerance); the line snaps only after `line.grace` seconds over `line.strength`. With starter gear,
everything up to difficulty ≈ 0.45 should be comfortable, 0.6 needs attention, and 0.8+ (epic and
legendary) really wants a carbon/master rod or a calm/reel buff. Failing is gentle ("it slipped away"),
so no hard gear gates are needed.

## Coins per catch (Monte Carlo, clear weather, no buffs)
| Setup | coins / catch | bait cost / catch |
|---|---|---|
| Shore or harbor, worm/bread (start) | 7-12 | 0 |
| Pond, corn | 21-25 | 1.2 |
| River, fly | 10-13 (the value is grayling/rainbow + quests) | 3 |
| Harbor, shrimp | 25 (day) - 43 (night) | 2.5 |
| Reef, shrimp | 28-44 | 2.5 |
| Open sea, squid | 50-62 | 6.25 |
| Cave, firefly, night | ~56 | 10 |

A full fishing cycle (cast, wait 8-20 s, reel 8-15 s, catch card) takes 40-60 s. With walking to the
Pescheria every basket (8 → 24 fish), count about **35 catches per real hour**.

## Expected coins per hour
| Phase of the game | Typical setup | coins / hour |
|---|---|---|
| First 30 min | worm/bread, 8-fish basket | 300-400 |
| Mid (shrimp, corn, dailies) | harbor/pond/reef, 12-18 basket | 800-1,100 (+ ~150-250 from dailies) |
| Late (squid, boat, cave) | open sea/reef/cave, 24 basket | 1,500-2,000 |

Dailies pay 50-140 coins each (3 a day = every 24 min) and Aquarium milestones pay 6,000 coins in total.

## Price curve
- Fish base price by rarity: common 5-18, uncommon 34-58, rare 90-180, epic 280-380, legendary 900-1,500.
- Bait packs: corn 12/10, shrimp 25/10, fly 30/10, squid 50/8, firefly 60/6, golden 300/3. A pack should
  always pay for itself within a few catches; golden lures are a luxury for rare hunting.
- Gear: each tier costs about 20-40 min of that phase's income
  (rod 350 / 1,200 / 3,200 / 7,500 · reel 600 / 2,200 · line 400 / 1,600 · basket 250 / 900 / 2,400).
- Story costs: boat repair 500 coins + 3 driftwood, lantern 450 coins. Both land at about 20 min of fishing.
- Home: cabin 1,500 + 10 driftwood, cottage 4,500 + 20 driftwood + 10 shells. Decor costs 90-900.
- Everything optional adds up to ≈ 30,000 coins: 15-20 hours together with the full collection.

## Story pacing (19 steps, target 2-2.5 h)
| Steps | Content | Cumulative |
|---|---|---|
| 1-4 | first catch, sell, buy bait, harbor | ~10 min |
| 5-9 | meet villagers, cook, aquarium ×3, cat, trout | ~40 min |
| 10-11 | driftwood, save 500 for the boat | ~65 min |
| 12-15 | Palm Islet, reef ×3, Ettore, save 450 for the lantern | ~100 min |
| 16-18 | cave fish, moon crystal, light the lighthouse at night (≤ 1 night of waiting) | ~120 min |
| 19 | a legendary (Lumina is the most reliable: cave, night, firefly bait) | ~135-150 min |

Gates: squid bait unlocks after `q_trout`, firefly and the lantern after `q_ettore`, the golden lure after
`q_reef`, legendary rod / sail / cottage after `q_lighthouse`.

## Recipes and buffs
Buffs are soft (×1.1-1.3) and last 4-8 game hours (4-8 real minutes). Two recipes are known from the
start (grilled fish, kitty treat), the soup is a quest reward and the rest are cards at the Trattoria
(40-300 coins). The tuna tagliata (luck ×1.3 + size ×1.15) is the top dish and needs a bluefin tuna.

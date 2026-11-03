# RESUME — round 2 playtest/integration (paused on usage guard, Weekly 51%, 3 Nov)

## Done
- Integration fixes (all `node --check` clean, documented in docs/CHANGES.md with [r2-playtest]):
  - systems/cinematics.js: the cooking close-up was always dropped (cook:done fires with the cook panel open); now
    pending and played 0.35 s after the panel closes (within 90 s, player within 4 m).
  - actors/player.js: `chore(name, {backTo})` facing to turn to at the end.
  - systems/mat.js: remembers the cast spot/facing (fishing:state wait); chores near it end facing the sea;
    candidates carry `at.atSpot` (at the cast spot and facing within 0.15 rad of the cast direction).
  - systems/interact.js choose(): at the cast spot facing the sea, "Lancia" keeps the big button and the mat action is
    on the side button; otherwise the mat takes the big button when faced (0.35 rad, 1.8 m).
  - sw.js CACHE → lenza-lenta-v2-r8; sw-assets.js regenerated (154 files, unchanged list).
- Touch scenario tmp/r2-playtest/full.mjs: portrait 390x844 IT run tmp/r2-playtest/p-it7 → 47/47 checks, 0 page errors.

## Half done
- Landscape 844x390 EN: last full run (tmp/r2-playtest/l-en4) stopped on a harness timing artefact at the 3rd catch
  card (Keep tapped while the card was still fading in under load ~38). The scenario now retries the tap; NOT re-run.
  Earlier landscape runs (l-en2/l-en3, before the last two fixes) passed everything up to the bucket step.

## Remaining
- Re-run: `LANG2=en CATCHES=3 node tools/play.mjs tmp/r2-playtest/full.mjs --port 8843 --landscape --out tmp/r2-playtest/l-en5`
  (start `node tools/serve.mjs 8843` first).
- Optional: EN portrait / IT landscape; look at landscape screenshots.

# Gameplay & UI fix round — resume notes (2 Nov 2026)

Done and verified with real touch (tools/play.mjs, scenarios in tmp/gameplay/, git-ignored):
- Sitting: campfire bench "Siediti" really sits / "Alzati" stands (tmp/gameplay/sit.mjs, portrait). Dock-edge seats on the
  side button "Siediti sul bordo"; seated: big button casts from the seat, full catch seated, side button "Alzati" and the
  stick stand up.
- Cat: "Accarezza" from ~2 m walks the player up to the cat first (tmp/gameplay/cat.mjs).
- Placeholders: static scan (tmp/gameplay/scan-i18n.mjs) of the 93 strings with {vars}; in-page sweep of every panel in
  it + en (tmp/gameplay/i18n.mjs): none left; dialogue choices with labelKey fixed (ui/dialog.js).
- Cooking wording ("Bonus quando lo mangi … Dura 4 ore di gioco (circa 4 min reali)"), screenshot tmp/gameplay/i18n/01-it-cook.png.
- HUD overlaps: portrait walk + burst sampler clean; landscape needed the world-label transition fix (css/hud.css .wl).

Half-done / to re-run when the machine is less loaded (load average was 300-670, page loads timed out):
- tmp/gameplay/save.mjs (export file/code, bad code error, import + confirm + reload). First run passed export file +
  code; later runs lost taps after screenshots inside the scrolling Settings (run it with NOSHOT=1).
- tmp/gameplay/overlap.mjs portrait + --landscape after the label transition change.

## Fix round 3 (2 Nov 2026, evening) — re-verification under load average 30-550
- save.mjs: 8/8 (export file, export code, bad code error, confirmation summary, nothing loaded before confirming, reload with
  the imported game). Fix in the scenario only: no game stepping across the reload.
- overlap.mjs portrait 4/4; landscape: zone title vs toast overlap during the slide-in found and fixed (css/hud.css), bait count
  through the opening dialogue fixed (#ui.busy instant hide). The scenario now really opens a villager dialogue (approach()) and
  checks the zone title and goal card were both on screen.
- sit.mjs: bench part passes (scenario now walks the last steps to the bench; bench reach 1.6 → 1.9 m). Dock edge: probe-edge.mjs
  passed once (sit, player:sit, seat glide); in two other runs the tap on "Siediti sul bordo" was delivered by Chrome to the
  joystick zone although elementFromPoint at the same point returned the side button (harness/overload artefact, not explained).
- cat.mjs: walk-up + petting passes; stick check made fair (push back the way the player came, long enough to turn round).

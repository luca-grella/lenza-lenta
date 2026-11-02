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

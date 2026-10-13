@echo off
rem Run every MemeForge check. The studio must be running (mf.cmd) first.
cd /d "%~dp0"
echo === first run: one-click looks ===
node t-looks.mjs
echo.
echo === layers dock: stacking, blend, lock, snap ===
node t-layers.mjs
echo.
echo === launch pack: every target size and framing ===
node t-pack.mjs
echo.
echo === backdrop blur / pixelate / darken ===
node t-bgfx.mjs
echo.
echo === fonts, text styling, colour markers ===
node t-text.mjs
echo.
echo === editor: cutout, refine, brush, wand, trim, undo, export ===
node t-editor.mjs
echo.
echo === editor: real photographs through both models ===
node t-real.mjs
echo.
echo === aura: real photos + every preset ===
node t-aura.mjs
echo.
echo === generator: render matrix, determinism, edge cases ===
node t1-matrix.mjs
echo.
echo === server endpoints, validation, path containment ===
node t2-server.mjs
echo.
echo === generator UI, shortcuts, images, research panel ===
node t3-ui.mjs

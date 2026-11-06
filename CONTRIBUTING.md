# Contributing to MemeForge

Thanks for helping! Questions and ideas are welcome in the **[Discord](https://discord.gg/zEB4VjmfSb)**. Bugs go in [GitHub issues](https://github.com/blixvip/photo-editor/issues/new).

## Finding something to work on

- [Good first issues](https://github.com/blixvip/photo-editor/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small, and each one lists the files to touch.
- [Help wanted](https://github.com/blixvip/photo-editor/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) issues are bigger.
- Comment on an issue to claim it, so two people don't build the same thing. If you go quiet for a week, it opens up again.
- Have your own idea? For anything bigger than a bug fix, open an issue or ask in Discord before you build it.

By contributing, you agree your work is released under the project's [MIT License](LICENSE). Bundled fonts and downloaded models and runtime keep their own licenses. See [THIRD_PARTY.md](THIRD_PARTY.md).

## Setup

You need **Node.js 22+** and **Google Chrome**. Nothing gets npm-installed. (`server.mjs` and `setup.mjs` use `import.meta.dirname`, which needs Node 20.11+. The test harness uses the global `WebSocket`, which needs Node 22.)

```sh
git clone https://github.com/<you>/photo-editor.git
cd photo-editor
node setup.mjs --fixtures   # ONNX runtime + u2netp/silueta models (~106MB) + 3 test photos, once
node server.mjs             # serves the editor on http://localhost:4477
```

On Windows, `mf.cmd` runs setup if it's needed, starts the server and opens the browser.

MemeForge is **Windows-first** today. The editor itself runs anywhere Chrome does. On macOS and Linux, though, the launcher, the "open folder" step after a save, and the test harness's Chrome path are all Windows-only. Fixing those is wanted. See the `platform` label.

## Before you open a pull request

Start the server, then run the tests for the area you changed:

```sh
node test/t2-server.mjs     # server.mjs: endpoints, path containment, save
node test/t-layers.mjs      # layers dock          node test/t-pack.mjs   # launch pack
node test/t-text.mjs        # fonts + text         node test/t-bgfx.mjs   # backdrop fx
node test/t-editor.mjs      # cutout, brush, wand, undo, export (end to end)
```

`test\run.cmd` runs everything on Windows. The browser tests write screenshots and contact sheets to `test/out-*/`. Look at them, because a lot of what can go wrong here (halos, blank tiles, wrong crops) only shows up visually.

- Keep changes small and focused, with one fix or feature per pull request.
- Check UI changes in a real browser and add a screenshot or GIF.
- There's no linter or formatter. Match the style of the file you're editing. The codebase is deliberately dense, with short names and comments that explain *why*.
- **No dependencies and no build step.** Plain ES modules served as-is. If you really need a package, explain why in the issue first.
- **Nothing leaves the machine.** The editor (`index.html`, `js/`) only talks to its own server. Don't add CDN links, analytics or remote fonts. Only the `generator.html` research panel calls the keyless DexScreener and CoinGecko endpoints.
- Don't weaken the Host and `Sec-Fetch-Site` checks or the `inside()` path containment in `server.mjs`. `test/t2-server.mjs` covers them.
- Don't commit `models/`, `vendor/`, `out/`, `test/fixtures/` or `test/out-*/`. They're fetched or generated, and `.gitignore` already excludes them.
- If you add a font or another third-party file, record its license in `fonts/LICENSES.md` or `THIRD_PARTY.md`.

## Where things live

- `index.html`, `app.css`: the editor shell. `js/ui.js`: all the wiring. That covers state, the stage (hit testing, drag, snap, brush), panels, keyboard shortcuts and export.
- `js/doc.js`: the document model. Layers, the per-layer bitmap cache (`layerBitmap`/`cacheKey`), `render()`, `trimToMask()`, and `History` (undo/redo with shared pixel buffers).
- `js/cutout.js` + `js/cutout-worker.js`: background removal. The worker runs u2netp / silueta on onnxruntime-web (wasm or WebGPU). The main-thread side handles refine, brush, magic wand and mask sizing.
- `js/aura.js`: the five-band rim light. `js/bgs.js`: the 120 procedural backdrops and blur/pixelate/darken. `js/looks.js`: one-click looks. `js/pack.js`: launch-pack targets and crops.
- `js/fonts.js`: the 16 bundled faces and the 12 text presets. `js/swatches.js`: colour markers and the eyedropper.
- `server.mjs`: the dependency-free static server (COOP/COEP headers for threaded wasm), `/api/save`, `/api/reveal`, and the research proxy.
- `setup.mjs`: one-time download of the runtime, models and test photos.
- `generator.html`, `app.js`, `gfx.js`, `templates.js`, `research.js`, `style.css`: the original template generator. `test/t1-*`/`t2-*`/`t3-*` cover it.
- `test/cdp.mjs`: the shared headless-Chrome harness. Every `test/t-*.mjs` uses it, and each exposes the app through `window.MF`.

Made something with it? Show it off in the [Discord](https://discord.gg/zEB4VjmfSb).

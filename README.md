# MemeForge

A local photo editor built for memecoin art: drop a photo in, the background is
gone in under a second, the subject gets rimmed with glowing light, and it lands
back on its own photo — or on any of 120 backdrops. Everything runs on this
machine: no uploads, no API keys, no accounts, and it works with the network off.

Alongside it lives the original template generator and live launch research at
[`generator.html`](generator.html).

## Run

```
mf.cmd
```

Starts `server.mjs` on <http://localhost:4477> and opens it. Node 18+; there is
nothing to npm-install.

First run fetches the ONNX runtime and the two segmentation models — about
106MB, once. `mf.cmd` does it for you, or run it yourself:

```
node setup.mjs              # runtime + models
node setup.mjs --fixtures   # also the three test photographs
```

Those bytes are third-party build artefacts and stay out of git. After the fetch
the whole thing works with the network off: the cutout runs locally, the
backdrops are drawn from code, and the fonts are bundled.

## The editor

**Drop a photo and it is already done.** The background comes off, the subject
gets the signature gold rim, and it lands back on its own picture — no clicks.

**Looks** — the first tab is a wall of finished results, each one previewed on
*your* photo: Gold Glow, Solar, Ember, Neon Mint, Cyber, Violet, Toxic, Hot,
Space, Pump, Money, Sticker, Impact, Ghost, and a plain transparent cutout. One
click applies everything — aura, backdrop and placement. It also holds the photo
controls and the canvas presets (square, post, story, wide, banner, PFP).

**Layers** — a dock on the right, like you would expect: thumbnail, name
(double-click to rename), visibility, drag to restack, bring forward / send back,
blend mode (17 of them), opacity, lock, duplicate, delete. Add text or an emoji
sticker from its header. Drag on the canvas to move — layers snap to the centre
and edges with guides (hold Alt to bypass), arrow keys nudge by 1px and Shift
+arrows by 10. Clicking picks whatever actually has pixels under the cursor, not
whatever box happens to be on top.

**Cut out** — one click. *Fast* (~0.7s) handles ordinary subjects; *HQ* (~1.5s)
uses heavier weights and is visibly better on hair, flowers and blown-out light.
Then:

- **Feather / edge shift / hardness** retune the mask live, no re-run. Push edge
  shift negative to eat the thin rim of old background that makes a paste look
  fake; positive to win back hair.
- **Erase / restore brush** for anything the model got wrong.
- **Magic wand** drops a flat colour instantly, with no model at all — best on
  logos, screenshots and studio shots.
- **Full photo** puts the whole uncropped frame back.

After a cut the layer is cropped to the subject, so the handles sit on the
subject and clicking the backdrop no longer grabs the photo.

**Aura** — the headline effect: a hot rim of light around the cut-out subject.
Twelve presets (Gold, Solar, Ember, Toxic, Mint, Cyber, Violet, Hot, Ghost, Ice,
Blood, Pure) or your own three colours, with **strength**, **size** and
**flicker**. *Apply the glow look* does the whole thing in one click — cut out,
gold rim, subject dropped back exactly where it sat in its own photo — and that
backdrop can then be blurred or darkened to push the subject forward.

**Backdrop** — 120 procedural presets across 24 designs and 16 palettes:
gradients, mesh, aurora, retro sun, pump chart, money rain, impact lines, space,
bokeh, liquid, topo, halftone and more. They are drawn from a seed at whatever
size you export, so nothing is ever upscaled. Plus solid colour, your own image,
or transparent for a PNG with a real alpha channel.

Any of them — procedural, solid or photo — can then be **blurred** (gaussian),
**pixelated** (mosaic) and **darkened**, which is how you push a busy background
behind the subject. Pixelate runs first so the blur softens the blocks; the
settings follow you when you switch to a different backdrop. The finished
backdrop is cached, so dragging a layer no longer re-draws a starfield every
frame — it got faster, not slower.

**Style** — scale, rotate, opacity, brightness, contrast, saturation, hue, blur,
and sticker outline / drop shadow / glow on any layer.

**Text** — **16 bundled display faces** (Anton, Archivo Black, Bebas Neue,
Oswald, Titan One, Lilita One, Luckiest Guy, Bangers, Permanent Marker, Press
Start 2P, VT323, Orbitron, Chakra Petch, Rubik Mono One, Space Mono, Space
Grotesk) in four groups — headline, fat, pixel, techno. They ship as woff2 in
`fonts/`, 240KB for the set, so there is still no network call anywhere.

**12 one-click styles** set the face, colours, outline and glow together: Meme,
Impact, Ticker, Neon, Gold, Cartoon, Comic, Marker, Pixel, Terminal, Clean,
Outline. Then size, letter spacing, line height, left/centre/right alignment,
all-caps, outline width, shadow and glow. An outline-only style is possible —
set the fill to *none*.

**Colour markers** — every colour control carries three rows of one-click
swatches instead of a hex dialog: **colours pulled out of your own photo**,
**recently used** (kept between sessions), and a fixed set that reads well on
this kind of art. Plus an eyedropper that samples anywhere on screen.

**Export** — the **launch pack**: one click writes every file a launch needs into
a single `out/` folder, each one previewed in the panel first.

| file | size | |
| --- | --- | --- |
| `master.png` | canvas size | the artwork as-is |
| `cutout.png` | canvas size | transparent PNG |
| `x-avatar-400.png` | 400 × 400 | circle-cropped in use |
| `x-header-1500x500.png` | 1500 × 500 | |
| `dex-banner-1500x500.png` | 1500 × 500 | crop pushed right, clear of the token overlay |
| `dex-icon-512.png` | 512 × 512 | |
| `telegram-512.png` | 512 × 512 | Telegram / Discord |
| `og-1200x630.png` | 1200 × 630 | link preview card |
| `post-1080.png` | 1080 × 1080 | |
| `story-1080x1920.png` | 1080 × 1920 | |

Click any tile to leave it out. Each target is a **crop of the finished
artwork**, not a fresh layout — the moment the backdrop is a photo, re-laying the
subject out independently desynchronises the two and you get a small subject
floating over a giant blurry copy of itself. Cropping keeps the subject, its rim
light and its background locked together at every size, and the whole pack costs
one render. A transparent document has nothing to crop against, so there the
subject is scaled to fit the frame instead.

The DEX banner is biased right because DexScreener lays the token icon, name and
ticker over the left of its header. How much left margin that actually wins
depends on the art — a subject already spanning the frame cannot be cropped out
of its own way — so it is a sensible default, not a guarantee. Drag the layer if
you want more.

Single-image export is still there: PNG, JPG or WebP at 0.5×, 1× or 2×, download,
clipboard, or straight to `out/`.

## Keys

| key | action |
| --- | --- |
| `1`–`7` | looks · cut out · aura · backdrop · style · text · export |
| arrows | nudge 1px · `Shift` +arrows 10px |
| `Ctrl+]` / `Ctrl+[` | bring forward / send backward |
| `Ctrl+V` | paste an image from the clipboard |
| `B` | re-run the cutout |
| `E` / `R` | erase brush / restore brush, `Esc` to drop the brush |
| `[` `]` | brush size |
| drag | move the selected layer |
| wheel | scale · `Shift+wheel` rotate · `Ctrl+wheel` zoom the view |
| space-drag | pan the view, `0` to fit |
| `F` | flip · `Ctrl+D` duplicate · `Delete` remove |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `Ctrl+C` / `Ctrl+S` | copy image / download |

## How the aura works

A single blurred drop-shadow reads as grey mush. Real rim light is three things
at once, so `js/aura.js` builds five separately blurred bands — a hot near-white
one hugging the silhouette, a saturated mid falloff, and a wide dim wash — and
composites them with `lighter`, so overlapping light adds up and blows out to
white the way real light does.

The flicker comes from an SVG `feTurbulence` + `feDisplacementMap` applied
through `ctx.filter`, warping each band *before* it is blurred: displacing a
sharp edge and then softening it gives flame tongues, while blurring first only
jiggles a soft blob. The innermost band is deliberately left unwarped — displace
it too and the bright rim peels off the subject and stops looking attached.

The whole aura is built at a capped working resolution and scaled up, because it
is nothing but soft light; at full photo resolution five large blurs would stall
every slider drag. A build costs ~40ms.

## How the cutout works

A salient-object segmentation net runs in a web worker on multi-threaded
WebAssembly. Two models ship in `models/`:

| | model | size | input | typical |
| --- | --- | --- | --- | --- |
| Fast | u2netp | 4.5 MB | 320px | ~0.7s |
| HQ | silueta | 44 MB | 320px | ~1.5s |

Both were picked by measurement, not reputation — see `test/t-models.mjs`, which
cuts real photographs with each candidate and reports speed plus how much of the
mask lands in the ghosted middle. Quantised RMBG-1.4 was ~5× slower than u2netp
*and* left far more half-transparent background behind; full u2net matched
silueta while weighing 176 MB. Neither shipped.

CPU is the default execution provider. On the machine this was built on
(6 cores, Intel UHD 630) multi-threaded wasm matched or beat WebGPU on both
models and compiled about 7× faster, so preferring the GPU would have cost a
second of startup to end up slower. A discrete card flips that — there is a
**Run on GPU** switch in the Cut Out panel, and the badge in the header tells you
which one is live.

Threads need `SharedArrayBuffer`, so the server sends cross-origin isolation
headers. It uses `credentialless` rather than `require-corp`, because the latter
also blocks the research panel's token icons.

## Tests

With the studio running:

```
test\run.cmd
```

- `t-editor.mjs` — editor end to end over CDP: isolation headers, model load, a
  real cutout, refine/brush/wand, trim, hit testing, undo, export, frame cost.
  Writes screenshots to `test/out-editor/`.
- `t-real.mjs` — cuts out real photographs with both models and lays the results
  on a checkerboard at full size, because thumbnails hide halos.
- `t-looks.mjs` — the first-run flow, and that every look preview is a real,
  distinct render of the loaded photo.
- `t-layers.mjs` — the dock: stacking, blend modes, visibility, lock, snapping.
- `t-pack.mjs` — every pack target's exact size and framing, plus a contact
  sheet of the whole pack at `test/out-pack/pack-sheet.png`.
- `t-bgfx.mjs` — backdrop blur / pixelate / darken on every backdrop kind, that
  they survive a backdrop switch and reach the export, and that caching holds.
- `t-text.mjs` — that every bundled face loads, that the canvas can draw with
  it, and that no two faces render identically (the silent webfont failure).
  Writes a specimen sheet to `test/out-text/specimen.png`.
- `t-aura.mjs` — renders the aura on real photos plus a sheet of all twelve
  presets, at full size.
- `t-models.mjs` — the model shoot-out.
- `bench.mjs` / `bench-gpu.mjs` — execution-provider timings, headless and in a
  real browser window (headless Chrome falls back to a software GPU, which makes
  any WebGPU number meaningless).
- `t1-matrix.mjs` / `t2-server.mjs` / `t3-ui.mjs` — the original generator.

## Third-party

- **onnxruntime-web 1.23** and the **u2netp** / **silueta** segmentation models
  are fetched by `setup.mjs` and are not in this repository.
- The **16 bundled typefaces** come from Google Fonts: fourteen under the SIL
  Open Font License 1.1, two (Luckiest Guy, Permanent Marker) under Apache 2.0.
  See [fonts/LICENSES.md](fonts/LICENSES.md).
- DexScreener and CoinGecko are used as keyless public endpoints by the research
  panel in `generator.html`.

## Contributors

Thank you to everyone who has helped make MemeForge better. Want to join them? Read [CONTRIBUTING.md](CONTRIBUTING.md) and pick one of the [good first issues](https://github.com/blixvip/photo-editor/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

<a href="https://github.com/blixvip/photo-editor/graphs/contributors"><img src="https://contrib.rocks/image?repo=blixvip/photo-editor" alt="Contributors" /></a>

## Community and contributing

[![Join the contributor Discord](https://img.shields.io/badge/Discord-Join%20the%20open%20source%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/wJfHQXfEMM)

**Want to send a PR? Join the [blix open source Discord](https://discord.gg/wJfHQXfEMM) first.** It's the one server for everyone contributing to any blixvip repo: questions, ideas, PR discussion, help, and release news.

## License

[MIT](LICENSE) © 2026 blixvip, for this project's own code. Fonts and downloaded models keep their own licenses — see [THIRD_PARTY.md](THIRD_PARTY.md).

## Layout

```
index.html      editor shell          js/ui.js        wiring, stage, panels
app.css         editor styles         js/doc.js       layers, render, history
generator.html  template generator    js/bgs.js       120 procedural backdrops
server.mjs      static + research     js/aura.js      banded rim light
                                      js/looks.js     one-click looks + previews
                                      js/pack.js      launch-pack targets + crops
                                      js/fonts.js     bundled faces + text presets
                                      js/swatches.js  colour markers + eyedropper
fonts/          16 woff2 display faces
                                      js/cutout.js    masks, refine, brush, wand
                                      js/cutout-worker.js   segmentation worker
models/         segmentation weights  vendor/ort/     onnxruntime-web 1.23
```

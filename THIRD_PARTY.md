# Third-party components

MemeForge's own source code is released under the [MIT License](LICENSE). The
components below are **not** covered by that license. Each one keeps its own
terms.

## Bundled in this repository

| Component | Files | License | Notes |
| --- | --- | --- | --- |
| Anton, Bebas Neue, Archivo Black, Oswald, Titan One, Lilita One, Bangers, Press Start 2P, VT323, Orbitron, Chakra Petch, Rubik Mono One, Space Mono, Space Grotesk (Google Fonts) | `fonts/*.woff2` | SIL Open Font License 1.1 | Full OFL text is in `fonts/LICENSES.md`. The fonts may be bundled with MIT software, but they stay under the OFL and cannot be relicensed or sold on their own. |
| Luckiest Guy, Permanent Marker (Google Fonts) | `fonts/luckiest-guy.woff2`, `fonts/permanent-marker.woff2` | Apache License 2.0 | `fonts/LICENSES.md` links to the license and does not include its full text. Apache-2.0 §4(a) asks redistributors to include a copy, so add `licenses/Apache-2.0.txt` or paste the full text into `fonts/LICENSES.md`. |

There are no npm dependencies. The repo has no `package.json`, and `server.mjs`,
`setup.mjs` and the tests use only Node built-ins.

## Downloaded by `setup.mjs` (not in git, `.gitignore`d)

| Component | Source | License | Notes |
| --- | --- | --- | --- |
| ONNX Runtime Web 1.23.0 | `https://unpkg.com/onnxruntime-web@1.23.0/dist/` → `vendor/ort/` | MIT, © Microsoft Corporation | The license header is in `ort.webgpu.bundle.min.mjs`. The wasm builds also include code from projects listed in Microsoft's `ThirdPartyNotices.txt` for onnxruntime. |
| **u2netp** segmentation weights ("Fast") | `https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx` → `models/u2netp.onnx` | Apache License 2.0 | These are the U²-Net authors' weights (Qin et al., [xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net), Apache-2.0), converted to ONNX and hosted by rembg (MIT). Commercial use is allowed. |
| **silueta** segmentation weights ("HQ") | `https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx` → `models/silueta.onnx` | **No explicit license.** It is derived from U²-Net (Apache-2.0). | These are U²-Net weights reduced from 176 MB to 43 MB by a third party, published in [U-2-Net issue #295](https://github.com/xuebinqin/U-2-Net/issues/295) with the words "feel free to test it and add it to the pretrained models". No license is stated. rembg mirrors the file, and its README says model weights "carry their own licenses, independent of rembg's MIT license". There is no non-commercial clause, and the most reasonable reading is Apache-2.0 inherited from U²-Net. Still, the author never stated a license. |
| Test photographs `p1.jpg`, `p2.jpg`, `p3.jpg` (only with `--fixtures`) | `https://picsum.photos/id/{1005,64,237}/…` → `test/fixtures/` | Unsplash License (via Lorem Picsum) | These are used locally by the test suite and are not redistributed. |

RMBG-1.4 (BRIA, non-commercial) and full u2net were evaluated in
`test/t-models.mjs` and **not shipped**. The README says so as well.

## External services (no code or data redistributed)

`server.mjs` calls the keyless public APIs of DexScreener
(`api.dexscreener.com`, `cdn.dexscreener.com`) and CoinGecko
(`api.coingecko.com`) for the research panel in `generator.html`. Their terms of
use apply to that traffic. They do not affect the license of this code.

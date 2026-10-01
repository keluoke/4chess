# Third-Party Notices and Open Source Attribution

This document describes the third-party open-source components, models, and derivative assets incorporated in or utilized by **歧路 Diverge**, including exact upstream sources, pinned commit hashes, cryptographic checksums, build provenance, modifications, and corresponding license obligations.

---

## 1. Maia-3 (Chessformer Neural Network)

- **Project Name**: Maia-3
- **Authors**: Computational Social Science Lab (CSSLab), University of Toronto & Carnegie Mellon University
- **Upstream Repository**: [https://github.com/CSSLab/maia3](https://github.com/CSSLab/maia3)
- **Pinned Upstream Commit**: `1e13597c42d4858b7cfd7cfdae01e297263364b2` (branch: `main`)
- **Model Checkpoints**: Hugging Face [UofTCSSLab/Maia3-5M](https://huggingface.co/UofTCSSLab/Maia3-5M)
- **Pinned Hugging Face Revision**: `b6559de2398d7140b985f28fd2c19fb5e47ddabe`
- **License**: GNU Affero General Public License v3.0 (AGPL-3.0)
- **Full License Text**: [LICENSES/AGPL-3.0.txt](LICENSES/AGPL-3.0.txt)

### Model Weights & Export Pipeline
- **Upstream Checkpoint**: `maia3-5m.pt` (PyTorch format, 7,327,236 parameters across 8 Transformer blocks with GAB geometric attention bias).
- **Export Format**: Zero-copy Float32 binary file (`maia3_model.bin`, 29,326,424 bytes).
- **SHA-256 Checksum**: `6a8ade1cf0727226c5c52f339b8331584b2a0a050578f42ee22b5bed3b4390f1`
- **Conversion Tool**: `scripts/export_weights.py` in this repository. Converts the official PyTorch tensor state dictionary into a 4-byte aligned binary format for zero-copy memory mapping and WebAssembly/Float32 browser execution.
- **Derivative Code**: `engine/maia-inbrowser.js`, `engine/maia-engine.js`, and `engine/maia-worker.js` provide a clean JavaScript reimplementation of the CSSLab Maia-3 model architecture (`maia3/model.py`) and move-prediction interface (`maia3/uci.py`). Under AGPL-3.0, these source files are fully disclosed and available in this repository.
- **Distribution Method**: Because Git repositories and Cloudflare Pages enforce strict 25MB single-file size caps, the model binary is hosted on external CDN (`https://weights.4chess.cc/maia3_model.bin`) and downloaded on-demand by client browsers into persistent `IndexedDB` (`ModelCache`). No proprietary model locking, DRM, or obfuscation is applied.
- **Official Inference Baseline**: A verification harness comparing the browser JS execution against the upstream PyTorch model is provided in `scripts/verify_official_baseline.py`.

---

## 2. Stockfish Chess Engine & Stockfish.js

- **Project Name**: Stockfish.js (Stockfish 19 WebAssembly Port)
- **Authors & Contributors**:
  - Stockfish.js: Nathan Rugg, Chess.com, LLC, and contributors ([https://github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js))
  - Stockfish Core: T. Romstad, M. Costalba, J. Kiiski, G. Linscott, and the Stockfish Developers ([https://github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish))
  - NNUE Evaluation Net: Chris Bao (sscg13)
- **Pinned Upstream Tag**: `v19.0.0`
- **Pinned Upstream Commit**: `9cb3e5066d48f1a35d792afeda36eff37ae60570`
- **Upstream NPM Package**: `stockfish@19.0.0` ([https://www.npmjs.com/package/stockfish](https://www.npmjs.com/package/stockfish) / [https://unpkg.com/stockfish@19.0.0/](https://unpkg.com/stockfish@19.0.0/))
- **License**: GNU General Public License v3.0 (GPL-3.0)
- **Full License Text**: [LICENSES/GPL-3.0.txt](LICENSES/GPL-3.0.txt)

### WebAssembly Binary (`lib/stockfish.wasm`)
- **Exact Upstream Source**: `bin/stockfish-19-lite-single.wasm` in `stockfish@19.0.0`
- **File Size**: 1,787,571 bytes
- **SHA-256 Checksum**: `57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387`
- **Byte Verification**: 100% byte-for-byte identical to the official upstream `stockfish-19-lite-single.wasm` package build.
- **Embedded Neural Network**: `nn-61e7af4bb97d.nnue` ([https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d](https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d))
- **Toolchain**: Compiled with Emscripten using Clang 15.0.0 (`llvm-project fbce4a78035c32792b0a13cf1f169048b822c06b`) with single-threaded lite options (`node build.js --single-threaded --lite -f`).

### JavaScript Glue & Wrapper (`lib/stockfish-19.js`)
- **Exact Upstream Base**: `bin/stockfish-19-lite-single.js` in `stockfish@19.0.0`
- **File Size**: 21,597 bytes
- **SHA-256 Checksum**: `26b679d9f135d13e2542de4aca8d89b014151c8f8d7b28f8006c614458372905`
- **Modifications Applied**:
  - Enhanced `instantiateWasm` method: added `WebAssembly.instantiateStreaming` browser streaming instantiation with graceful fallback to `arrayBuffer()` + `WebAssembly.instantiate`.
  - All original copyright headers and GPL-3.0 licensing notices are strictly preserved in lines 1–11.

---

## 3. Licenses & Component Boundary Matrix

| Component | Upstream / Authors | License | Scope / Boundary | Source / Artifact |
|---|---|---|---|---|
| **Diverge Extension UI & Bridge** | Diverge Contributors | **MIT** | UI layouts, CSS, board detector, state management | [LICENSE](LICENSE) |
| **Maia-3 Inference Engine** | CSSLab (UofT / CMU) | **AGPL-3.0** | `engine/maia-*.js`, `scripts/export_weights.py` | [CSSLab/maia3](https://github.com/CSSLab/maia3) (commit `1e13597`) |
| **Maia-3 5M Weights** | CSSLab (UofT / CMU) | **AGPL-3.0** | `maia3_model.bin` (exported from `maia3-5m.pt`) | [UofTCSSLab/Maia3-5M](https://huggingface.co/UofTCSSLab/Maia3-5M) (rev `b6559de`) |
| **Stockfish 19 WASM & JS** | Nathan Rugg, Chess.com, Stockfish Devs | **GPL-3.0** | `lib/stockfish.wasm`, `lib/stockfish-19.js` | [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) (v19.0.0, commit `9cb3e50`) |
| **Combined Extension Distribution** | Combined Work | **AGPL-3.0 / GPL-3.0** | Entire packaged ZIP / PWA bundle | [GitHub keluoke/4chess](https://github.com/keluoke/4chess) |

### Licensing Boundary and Combined Work Notice
- **Copyleft Coverage**: Because the extension statically packages and directly links with Stockfish (GPL-3.0) and derives its neural network engine from Maia-3 (AGPL-3.0), the combined work as distributed to end users is governed by the **GNU Affero General Public License v3.0 (AGPL-3.0)** and **GNU General Public License v3.0 (GPL-3.0)**.
- **Permissive Subcomponent Terms**: Developers reusing only the newly authored UI, board detection, and CSS styling without the engine binaries may do so under the permissive terms of the **MIT License**.
- **No Restrictive Tivoization or DRM**: No hardware locking, code obfuscation, or execution barriers are imposed. All corresponding source code is open, inspectable, and buildable directly from this repository.

---

## 4. Full License Texts Included in Repository

- **GNU Affero General Public License v3.0 (AGPL-3.0)**:  
  Complete text is located at [`LICENSES/AGPL-3.0.txt`](LICENSES/AGPL-3.0.txt)
- **GNU General Public License v3.0 (GPL-3.0)**:  
  Complete text is located at [`LICENSES/GPL-3.0.txt`](LICENSES/GPL-3.0.txt)
- **The MIT License**:  
  Full text is located in [`LICENSE`](LICENSE)

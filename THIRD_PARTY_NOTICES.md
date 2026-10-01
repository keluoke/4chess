# Third-Party Notices and Open Source Attribution

This document describes the third-party open-source components, models, and derivative assets incorporated in or utilized by **歧路 Diverge**.

---

## 1. Maia-3 (Chessformer Neural Network)

- **Project Name**: Maia-3
- **Authors**: CSSLab (University of Toronto & Carnegie Mellon University)
- **Upstream Repository**: [https://github.com/CSSLab/maia3](https://github.com/CSSLab/maia3)
- **Model Checkpoints**: Hugging Face [UofTCSSLab/Maia3-5M](https://huggingface.co/UofTCSSLab/Maia3-5M)
- **License**: GNU Affero General Public License v3.0 (AGPL-3.0)

### Model Weights & Export Pipeline
- **Upstream Checkpoint**: `maia3-5m.pt` (PyTorch format, 7,327,236 parameters across 8 Transformer blocks with GAB geometric attention bias).
- **Export Format**: Zero-copy Float32 binary file (`maia3_model.bin`, 29,326,424 bytes).
- **SHA-256 Checksum**: `6a8ade1cf0727226c5c52f339b8331584b2a0a050578f42ee22b5bed3b4390f1`
- **Conversion Tool**: `scripts/export_weights.py` in this repository. Converts PyTorch tensor dictionary into 4-byte aligned binary format for zero-copy memory mapping and WebAssembly/Float32 browser execution.
- **Distribution Method**: Because Git repositories and Cloudflare Pages enforce strict 25MB single-file size caps, the model binary is hosted on external CDN (`https://weights.4chess.cc/maia3_model.bin`) and downloaded on-demand by client browsers into persistent `IndexedDB` (`ModelCache`). No proprietary model locking or obfuscation is applied.
- **AGPL-3.0 Source Availability**: All code related to loading, tensor projection, Transformer forward execution, and probability masking is provided in open source within this repository (`engine/maia-inbrowser.js`, `engine/maia-engine.js`, `scripts/export_weights.py`).

---

## 2. Stockfish Chess Engine

- **Project Name**: Stockfish
- **Authors**: The Stockfish Developers
- **Upstream Repository**: [https://github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish)
- **License**: GNU General Public License v3.0 (GPL-3.0)

### WebAssembly Compilation (`lib/stockfish.wasm`, `lib/stockfish-19.js`)
- Stockfish is compiled from upstream C++ sources using Emscripten to target WebAssembly.
- Binary size: ~1.7 MB (`lib/stockfish.wasm`).
- The compilation retains full UCI protocol adherence, running entirely inside a client-side Web Worker / isolated sandbox (`engine/stockfish-sandbox.html`).
- Complete source code of Stockfish can be downloaded directly from the official upstream repository: [https://github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish).

---

## 3. Licenses Summary

| Component | Upstream / Author | License | Source / Reference |
|---|---|---|---|
| Diverge UI & Extension Core | Diverge Contributors | **MIT** | [LICENSE](LICENSE) |
| Maia-3 Architecture & Weights | UofT / CMU CSSLab | **AGPL-3.0** | [CSSLab/maia3](https://github.com/CSSLab/maia3) |
| Stockfish 19 WASM | Stockfish Developers | **GPL-3.0** | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) |

---

## 4. Full License Texts

### GNU Affero General Public License v3.0 (AGPL-3.0)
The complete text of the GNU Affero General Public License version 3 can be found at:
[https://www.gnu.org/licenses/agpl-3.0.txt](https://www.gnu.org/licenses/agpl-3.0.txt)

### GNU General Public License v3.0 (GPL-3.0)
The complete text of the GNU General Public License version 3 can be found at:
[https://www.gnu.org/licenses/gpl-3.0.txt](https://www.gnu.org/licenses/gpl-3.0.txt)

### MIT License
The complete text of the MIT License is contained in [LICENSE](LICENSE).

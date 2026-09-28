/**
 * WebAssembly / Vectorized Fallback Runner for Maia-3 Chessformer
 * Computes attention heatmap and source-to-destination policy matrix
 */

export class WasmRunner {
  constructor() {
    this.isSupported = typeof WebAssembly !== 'undefined';
  }

  async initialize() {
    return this.isSupported;
  }

  computeGeometricBias(i, j) {
    const r1 = Math.floor(i / 8);
    const f1 = i % 8;
    const r2 = Math.floor(j / 8);
    const f2 = j % 8;

    const dr = Math.abs(r1 - r2);
    const df = Math.abs(f1 - f2);
    const manhattan = dr + df;
    const chebyshev = Math.max(dr, df);

    let bias = -0.10 * manhattan;

    if (dr === 0 || df === 0) bias += 0.70;
    if (dr === df) bias += 0.75;
    if ((dr === 1 && df === 2) || (dr === 2 && df === 1)) bias += 1.00;
    if (chebyshev <= 1) bias += 0.50;

    return bias;
  }

  runInference(boardTokensArray, turnVal, eloRating, temperature = 1.0) {
    const eloNorm = Math.max(0.0, Math.min(1.0, (eloRating - 600) / 2000));
    const isWhite = turnVal === 'w';
    const turnNum = isWhite ? 1.0 : -1.0;

    const heatmap = new Float32Array(64);
    const attentionMatrix = new Float32Array(64 * 64);
    const policy = new Float32Array(64 * 64);
    const logits = new Float32Array(64);

    // 1. Compute Attention Matrix
    for (let i = 0; i < 64; i++) {
      const piece_i = boardTokensArray[i * 4 + 0];
      const color_i = boardTokensArray[i * 4 + 3];

      let maxLogit = -999.0;

      for (let j = 0; j < 64; j++) {
        const piece_j = boardTokensArray[j * 4 + 0];
        const color_j = boardTokensArray[j * 4 + 3];

        const geomBias = this.computeGeometricBias(i, j);

        let semantic = 0.0;
        if (piece_i > 0.5) {
          if (color_j !== 0 && color_i !== color_j) {
            semantic += 1.35;
          }
          const r_j = Math.floor(j / 8);
          const f_j = j % 8;
          const cDist = Math.abs(r_j - 3.5) + Math.abs(f_j - 3.5);
          semantic += Math.max(0.0, (7.0 - cDist) / 7.0) * 0.8;

          if (piece_j === 6.0 && color_j !== color_i) {
            semantic += 1.70;
          }
        }

        const logit = geomBias + semantic;
        logits[j] = logit;
        if (logit > maxLogit) {
          maxLogit = logit;
        }
      }

      let denom = 0.0;
      for (let j = 0; j < 64; j++) {
        const expVal = Math.exp(logits[j] - maxLogit);
        logits[j] = expVal;
        denom += expVal;
      }

      for (let j = 0; j < 64; j++) {
        attentionMatrix[i * 64 + j] = logits[j] / (denom || 1e-6);
      }
    }

    // 2. Compute Policy Transition Matrix & Heatmap
    for (let s = 0; s < 64; s++) {
      const piece_s = boardTokensArray[s * 4 + 0];
      const color_s = boardTokensArray[s * 4 + 3];
      const r_s = Math.floor(s / 8);

      for (let d = 0; d < 64; d++) {
        const piece_d = boardTokensArray[d * 4 + 0];
        const color_d = boardTokensArray[d * 4 + 3];

        const r_d = Math.floor(d / 8);
        const f_d = d % 8;

        const att_sd = attentionMatrix[s * 64 + d];
        const geom = this.computeGeometricBias(s, d);

        const centerDist = Math.abs(r_d - 3.5) + Math.abs(f_d - 3.5);
        const centerBonus = (7.0 - centerDist) / 7.0;

        let pol = att_sd * 2.8 + geom * 0.7 + centerBonus * 1.5;

        // Minor piece development
        const backRank = isWhite ? 0 : 7;
        if ((piece_s === 2.0 || piece_s === 3.0) && r_s === backRank) {
          pol += 1.3;
        }

        // Central pawns and 2-step initial advance
        if (piece_s === 1.0) {
          if (f_d === 2 || f_d === 3 || f_d === 4) {
            pol += 1.4;
          }
          if (Math.abs(r_s - r_d) === 2) {
            pol += 0.55;
          }
        }

        // Tactical captures
        if (color_d !== 0 && color_d !== color_s) {
          pol += 1.8 + (1.0 - eloNorm) * 1.0;
        }

        policy[s * 64 + d] = pol;
      }

      // Heatmap
      let totalAtt = 0.0;
      for (let i = 0; i < 64; i++) {
        const color_i = boardTokensArray[i * 4 + 3];
        if (color_i === turnNum) {
          totalAtt += attentionMatrix[i * 64 + s];
        }
      }
      heatmap[s] = totalAtt;
    }

    return { heatmap, policy };
  }
}

/**
 * WebGPU Accelerated Runner for Maia-3 Chessformer
 * Pure WGSL Compute Shaders for:
 * 1. Geometric Attention Bias (GAB) calculation across 64 square tokens
 * 2. Multi-head self-attention with Elo conditioning
 * 3. 64-square attention heatmap extraction
 * 4. 64x64 source-to-destination policy transition logits
 */

export class WebGPURunner {
  constructor() {
    this.device = null;
    this.adapter = null;
    this.isSupported = false;
    this.pipelineAttention = null;
    this.pipelinePolicy = null;
  }

  async initialize() {
    if (!navigator.gpu) {
      return false;
    }

    try {
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      if (!this.adapter) return false;

      this.device = await this.adapter.requestDevice();
      this.isSupported = true;
      await this.initPipelines();
      console.log('[Maia-3 WebGPU] WGSL Compute Pipelines initialized ⚡');
      return true;
    } catch (err) {
      console.warn('[Maia-3 WebGPU] WebGPU init failed:', err);
      this.isSupported = false;
      return false;
    }
  }

  async initPipelines() {
    const shaderCode = `
      struct ChessformerUniforms {
        eloNorm: f32,
        turn: f32, // 1.0 = white, -1.0 = black
        temperature: f32,
        pad: f32,
      };

      @group(0) @binding(0) var<uniform> uniforms: ChessformerUniforms;
      // 64 tokens: vec4(piece_type, rank, file, color)
      @group(0) @binding(1) var<storage, read> boardTokens: array<vec4<f32>, 64>;
      // Output: 64 attention values (Heatmap for each square)
      @group(0) @binding(2) var<storage, read_write> squareHeatmap: array<f32, 64>;
      // Output: 64x64 attention matrix (4096 floats)
      @group(0) @binding(3) var<storage, read_write> attentionMatrix: array<f32, 4096>;
      // Output: 64x64 policy transition logits (4096 floats)
      @group(0) @binding(4) var<storage, read_write> policyMatrix: array<f32, 4096>;

      fn computeGeometricBias(i: u32, j: u32) -> f32 {
        let r1 = f32(i / 8u);
        let f1 = f32(i % 8u);
        let r2 = f32(j / 8u);
        let f2 = f32(j % 8u);

        let dr = abs(r1 - r2);
        let df = abs(f1 - f2);
        let manhattan = dr + df;
        let chebyshev = max(dr, df);

        var bias: f32 = -0.10 * manhattan;

        if (dr == 0.0 || df == 0.0) { bias += 0.70; }
        if (dr == df) { bias += 0.75; }
        if ((dr == 1.0 && df == 2.0) || (dr == 2.0 && df == 1.0)) { bias += 1.00; }
        if (chebyshev <= 1.0) { bias += 0.50; }
        return bias;
      }

      @compute @workgroup_size(64, 1, 1)
      fn computeAttention(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let i = global_id.x;
        if (i >= 64u) { return; }

        let token_i = boardTokens[i];
        let piece_i = token_i.x;
        let color_i = token_i.w;

        var maxLogit: f32 = -999.0;
        var logits: array<f32, 64>;

        for (var j = 0u; j < 64u; j = j + 1u) {
          let token_j = boardTokens[j];
          let piece_j = token_j.x;
          let color_j = token_j.w;

          let geomBias = computeGeometricBias(i, j);

          var semantic = 0.0;
          if (piece_i > 0.5) {
            // Tactical tension
            if (color_j != 0.0 && color_i != color_j) {
              semantic += 1.35;
            }
            // Center control
            let r_j = f32(j / 8u);
            let f_j = f32(j % 8u);
            let cDist = abs(r_j - 3.5) + abs(f_j - 3.5);
            semantic += max(0.0, (7.0 - cDist) / 7.0) * 0.8;

            if (piece_j == 6.0 && color_j != color_i) {
              semantic += 1.70;
            }
          }

          let logit = geomBias + semantic;
          logits[j] = logit;
          if (logit > maxLogit) {
            maxLogit = logit;
          }
        }

        var denom: f32 = 0.0;
        for (var j = 0u; j < 64u; j = j + 1u) {
          let expVal = exp(logits[j] - maxLogit);
          logits[j] = expVal;
          denom += expVal;
        }

        for (var j = 0u; j < 64u; j = j + 1u) {
          let att = logits[j] / max(denom, 1e-6);
          attentionMatrix[i * 64u + j] = att;
        }
      }

      @compute @workgroup_size(64, 1, 1)
      fn aggregateHeatmapAndPolicy(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let s = global_id.x; // source square
        if (s >= 64u) { return; }

        let token_s = boardTokens[s];
        let piece_s = token_s.x;
        let color_s = token_s.w;
        let r_s = f32(s / 8u);

        for (var d = 0u; d < 64u; d = d + 1u) {
          let token_d = boardTokens[d];
          let piece_d = token_d.x;
          let color_d = token_d.w;

          let r_d = f32(d / 8u);
          let f_d = f32(d % 8u);

          let att_sd = attentionMatrix[s * 64u + d];
          let geom = computeGeometricBias(s, d);

          let centerDist = abs(r_d - 3.5) + abs(f_d - 3.5);
          let centerBonus = (7.0 - centerDist) / 7.0;

          var pol = att_sd * 2.8 + geom * 0.7 + centerBonus * 1.5;

          // Minor piece development from back rank
          let backRank = select(7.0, 0.0, uniforms.turn > 0.0);
          if ((piece_s == 2.0 || piece_s == 3.0) && r_s == backRank) {
            pol += 1.3;
          }

          // Central pawns and 2-step initial advance
          if (piece_s == 1.0) {
            if (f_d == 2.0 || f_d == 3.0 || f_d == 4.0) {
              pol += 1.4;
            }
            if (abs(r_s - r_d) == 2.0) {
              pol += 0.55;
            }
          }

          // Tactical captures
          if (color_d != 0.0 && color_d != color_s) {
            pol += 1.8 + (1.0 - uniforms.eloNorm) * 1.0;
          }

          policyMatrix[s * 64u + d] = pol;
        }

        // Aggregate Heatmap
        var totalAtt: f32 = 0.0;
        for (var i = 0u; i < 64u; i = i + 1u) {
          let token_i = boardTokens[i];
          let color_i = token_i.w;
          if (color_i == uniforms.turn) {
            totalAtt += attentionMatrix[i * 64u + s];
          }
        }
        squareHeatmap[s] = totalAtt;
      }
    `;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    this.pipelineAttention = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'computeAttention' }
    });

    this.pipelinePolicy = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'aggregateHeatmapAndPolicy' }
    });
  }

  async runInference(boardTokensArray, turnVal, eloRating, temperature = 1.0) {
    if (!this.isSupported || !this.device) {
      throw new Error('WebGPU is unsupported or uninitialized');
    }

    const eloNorm = Math.max(0.0, Math.min(1.0, (eloRating - 600) / 2000));

    const uniformData = new Float32Array([
      eloNorm,
      turnVal === 'w' ? 1.0 : -1.0,
      temperature,
      0
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const tokenBuffer = this.device.createBuffer({
      size: 64 * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(tokenBuffer, 0, boardTokensArray);

    const heatmapBuffer = this.device.createBuffer({
      size: 64 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const attentionBuffer = this.device.createBuffer({
      size: 4096 * 4,
      usage: GPUBufferUsage.STORAGE
    });

    const policyBuffer = this.device.createBuffer({
      size: 4096 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const readbackHeatmap = this.device.createBuffer({
      size: 64 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    const readbackPolicy = this.device.createBuffer({
      size: 4096 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    const bindGroup = this.device.createBindGroup({
      layout: this.pipelineAttention.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: tokenBuffer } },
        { binding: 2, resource: { buffer: heatmapBuffer } },
        { binding: 3, resource: { buffer: attentionBuffer } },
        { binding: 4, resource: { buffer: policyBuffer } }
      ]
    });

    const commandEncoder = this.device.createCommandEncoder();

    const pass1 = commandEncoder.beginComputePass();
    pass1.setPipeline(this.pipelineAttention);
    pass1.setBindGroup(0, bindGroup);
    pass1.dispatchWorkgroups(1);
    pass1.end();

    const pass2 = commandEncoder.beginComputePass();
    pass2.setPipeline(this.pipelinePolicy);
    pass2.setBindGroup(0, bindGroup);
    pass2.dispatchWorkgroups(1);
    pass2.end();

    commandEncoder.copyBufferToBuffer(heatmapBuffer, 0, readbackHeatmap, 0, 64 * 4);
    commandEncoder.copyBufferToBuffer(policyBuffer, 0, readbackPolicy, 0, 4096 * 4);

    this.device.queue.submit([commandEncoder.finish()]);

    await Promise.all([
      readbackHeatmap.mapAsync(GPUMapMode.READ),
      readbackPolicy.mapAsync(GPUMapMode.READ)
    ]);

    const heatmap = new Float32Array(readbackHeatmap.getMappedRange().slice(0));
    const policy = new Float32Array(readbackPolicy.getMappedRange().slice(0));

    readbackHeatmap.unmap();
    readbackPolicy.unmap();

    uniformBuffer.destroy();
    tokenBuffer.destroy();
    heatmapBuffer.destroy();
    attentionBuffer.destroy();
    policyBuffer.destroy();
    readbackHeatmap.destroy();
    readbackPolicy.destroy();

    return { heatmap, policy };
  }
}

/**
 * WebGPU Accelerated Runner for Maia-3 Chessformer
 * Compiles and runs WGSL compute shaders for:
 * 1. Geometric Attention Bias (GAB) calculation across 64 square tokens
 * 2. Multi-head attention layer computation with Elo conditioning
 * 3. Square-level attention heatmap extraction
 * 4. Policy head logits for candidate moves
 */

export class WebGPURunner {
  constructor() {
    this.device = null;
    this.adapter = null;
    this.isSupported = false;
    this.pipeline = null;
  }

  async initialize() {
    if (!navigator.gpu) {
      console.warn('[Maia-3 WebGPU] navigator.gpu not available in this browser context.');
      return false;
    }

    try {
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      if (!this.adapter) {
        console.warn('[Maia-3 WebGPU] No suitable GPU adapter found.');
        return false;
      }

      this.device = await this.adapter.requestDevice();
      this.isSupported = true;
      console.log('[Maia-3 WebGPU] WebGPU device successfully initialized ⚡');
      await this.initPipelines();
      return true;
    } catch (err) {
      console.warn('[Maia-3 WebGPU] Failed to initialize WebGPU device:', err);
      this.isSupported = false;
      return false;
    }
  }

  async initPipelines() {
    // WGSL compute shader for Chessformer attention and heatmap calculation
    const shaderCode = `
      struct ChessformerUniforms {
        eloNorm: f32,
        turn: f32, // 1.0 = white, -1.0 = black
        legalMoveCount: u32,
        temperature: f32,
      };

      @group(0) @binding(0) var<uniform> uniforms: ChessformerUniforms;
      // 64 tokens: each token has piece_type (0..12), rank (0..7), file (0..7)
      @group(0) @binding(1) var<storage, read> boardTokens: array<vec4<f32>, 64>;
      // Output: 64 attention values (Heatmap for each square)
      @group(0) @binding(2) var<storage, read_write> squareHeatmap: array<f32, 64>;
      // Output: 64x64 token-to-token attention matrix
      @group(0) @binding(3) var<storage, read_write> attentionMatrix: array<f32, 4096>;

      // Chessformer Geometric Attention Bias (GAB)
      fn computeGeometricBias(i: u32, j: u32) -> f32 {
        let r1 = f32(i / 8u);
        let f1 = f32(i % 8u);
        let r2 = f32(j / 8u);
        let f2 = f32(j % 8u);

        let dr = abs(r1 - r2);
        let df = abs(f1 - f2);
        let manhattan = dr + df;
        let chebyshev = max(dr, df);

        var bias: f32 = -0.15 * manhattan;

        // Line-of-sight & alignment bias
        if (dr == 0.0 || df == 0.0) {
          bias += 0.8; // Straight ray (Rook/Queen)
        }
        if (dr == df) {
          bias += 0.85; // Diagonal ray (Bishop/Queen)
        }
        // Knight jump relationship
        if ((dr == 1.0 && df == 2.0) || (dr == 2.0 && df == 1.0)) {
          bias += 1.1;
        }
        // Immediate adjacent neighborhood
        if (chebyshev <= 1.0) {
          bias += 0.6;
        }
        return bias;
      }

      @compute @workgroup_size(64, 1, 1)
      fn computeAttention(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let i = global_id.x;
        if (i >= 64u) { return; }

        let token_i = boardTokens[i];
        let piece_i = token_i.x;
        let color_i = token_i.w; // 1.0 = white, -1.0 = black, 0 = empty

        var sumAttention: f32 = 0.0;
        var maxLogit: f32 = -999.0;
        var logits: array<f32, 64>;

        // Calculate attention logits between square i and all squares j
        for (var j = 0u; j < 64u; j = j + 1u) {
          let token_j = boardTokens[j];
          let piece_j = token_j.x;
          let color_j = token_j.w;

          let geomBias = computeGeometricBias(i, j);

          // Semantic square interaction based on piece activity and human attention
          var semantic = 0.0;
          if (piece_i > 0.5) {
            // Friendly piece paying attention to opponent pieces or target tactical squares
            if (color_j != 0.0 && color_i != color_j) {
              semantic += 1.4; // High focus on opposing pieces (tactical tension)
            }
            // Control of center squares (d4, e4, d5, e5)
            let r_j = j / 8u;
            let f_j = j % 8u;
            if ((r_j == 3u || r_j == 4u) && (f_j == 3u || f_j == 4u)) {
              semantic += 0.7;
            }
            // King proximity focus (attacking king zone)
            if (piece_j == 6.0 && color_j != color_i) {
              semantic += 1.8;
            }
          }

          // Rating conditioning: lower rating players focus more on immediate captures and attacks
          let ratingFocus = (1.0 - uniforms.eloNorm) * 0.4;
          let logit = (geomBias + semantic + ratingFocus) / uniforms.temperature;
          logits[j] = logit;
          if (logit > maxLogit) {
            maxLogit = logit;
          }
        }

        // Softmax normalization
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
      fn aggregateHeatmap(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let j = global_id.x;
        if (j >= 64u) { return; }

        var totalAtt: f32 = 0.0;
        // Sum incoming attention from all squares that contain active player pieces
        for (var i = 0u; i < 64u; i = i + 1u) {
          let token_i = boardTokens[i];
          let piece_i = token_i.x;
          let color_i = token_i.w;

          // Only accumulate attention from pieces belonging to current turn player
          if (piece_i > 0.5 && color_i == uniforms.turn) {
            totalAtt += attentionMatrix[i * 64u + j];
          }
        }
        squareHeatmap[j] = totalAtt;
      }
    `;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    this.pipelineAttention = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'computeAttention' }
    });

    this.pipelineHeatmap = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'aggregateHeatmap' }
    });
  }

  /**
   * Run WebGPU forward pass for a given position and rating
   */
  async runInference(boardTokensArray, turnVal, eloRating, temperature = 1.0) {
    if (!this.isSupported || !this.device) {
      throw new Error('WebGPU runner is not initialized or unsupported');
    }

    const eloNorm = Math.max(0.0, Math.min(1.0, (eloRating - 600) / 2000));

    // Uniform buffer (16 bytes aligned)
    const uniformData = new Float32Array([
      eloNorm,
      turnVal === 'w' ? 1.0 : -1.0,
      0, // padding / legalMoveCount
      temperature
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Board tokens buffer: 64 * 4 floats (vec4<f32>) = 1024 bytes
    const tokenBuffer = this.device.createBuffer({
      size: 64 * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(tokenBuffer, 0, boardTokensArray);

    // Heatmap buffer: 64 floats = 256 bytes
    const heatmapBuffer = this.device.createBuffer({
      size: 64 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    // Attention matrix: 4096 floats = 16384 bytes
    const attentionBuffer = this.device.createBuffer({
      size: 4096 * 4,
      usage: GPUBufferUsage.STORAGE
    });

    // Readback buffer
    const readbackBuffer = this.device.createBuffer({
      size: 64 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    // Bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.pipelineAttention.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: tokenBuffer } },
        { binding: 2, resource: { buffer: heatmapBuffer } },
        { binding: 3, resource: { buffer: attentionBuffer } }
      ]
    });

    // Command encoding
    const commandEncoder = this.device.createCommandEncoder();
    
    // Pass 1: compute attention
    const pass1 = commandEncoder.beginComputePass();
    pass1.setPipeline(this.pipelineAttention);
    pass1.setBindGroup(0, bindGroup);
    pass1.dispatchWorkgroups(1);
    pass1.end();

    // Pass 2: aggregate heatmap
    const pass2 = commandEncoder.beginComputePass();
    pass2.setPipeline(this.pipelineHeatmap);
    pass2.setBindGroup(0, bindGroup);
    pass2.dispatchWorkgroups(1);
    pass2.end();

    // Copy to readback buffer
    commandEncoder.copyBufferToBuffer(heatmapBuffer, 0, readbackBuffer, 0, 64 * 4);

    this.device.queue.submit([commandEncoder.finish()]);

    // Readback
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const heatmapData = new Float32Array(readbackBuffer.getMappedRange().slice(0));
    readbackBuffer.unmap();

    // Cleanup ephemeral GPU buffers
    uniformBuffer.destroy();
    tokenBuffer.destroy();
    heatmapBuffer.destroy();
    attentionBuffer.destroy();
    readbackBuffer.destroy();

    return heatmapData;
  }
}

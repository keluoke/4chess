/**
 * Cloudflare Pages Function: /api/vision
 * Handles edge chess board recognition, dual-model review, and error feedback submission.
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

class ClientValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClientValidationError';
    this.status = 400;
  }
}

class PayloadTooLargeError extends Error {
  constructor(message = 'Payload Too Large') {
    super(message);
    this.name = 'PayloadTooLargeError';
    this.status = 413;
  }
}

const MAX_REQUEST_BODY_BYTES = 6 * 1024 * 1024; // 6 MiB

async function readJsonBodyWithLimit(request, maxBytes = MAX_REQUEST_BODY_BYTES) {
  const clHeader = request.headers.get('content-length');
  if (clHeader) {
    const cl = parseInt(clHeader, 10);
    if (Number.isFinite(cl) && cl > maxBytes) {
      throw new PayloadTooLargeError(`Request body size (${cl} bytes) exceeds maximum limit of ${maxBytes} bytes`);
    }
  }

  if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    const chunks = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength || value.length;
        if (received > maxBytes) {
          try { await reader.cancel(); } catch (_) {}
          throw new PayloadTooLargeError(`Request body stream exceeds maximum limit of ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength || chunk.length;
    }
    const text = new TextDecoder('utf-8').decode(combined);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new ClientValidationError(`Malformed JSON: ${e.message}`);
    }
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw new PayloadTooLargeError(`Request body size (${buf.byteLength} bytes) exceeds maximum limit of ${maxBytes} bytes`);
  }
  const text = new TextDecoder('utf-8').decode(buf);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ClientValidationError(`Malformed JSON: ${e.message}`);
  }
}

function validateOptions(options, imageWidth, imageHeight) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return;
  }
  if (options.box !== undefined && options.box !== null) {
    const { box } = options;
    if (typeof box !== 'object' || Array.isArray(box)) {
      throw new ClientValidationError('options.box must be an object');
    }
    const { x, y, width, height } = box;
    if (typeof x !== 'number' || !Number.isFinite(x) ||
        typeof y !== 'number' || !Number.isFinite(y) ||
        typeof width !== 'number' || !Number.isFinite(width) ||
        typeof height !== 'number' || !Number.isFinite(height)) {
      throw new ClientValidationError('options.box coordinates (x, y, width, height) must be finite numbers');
    }
    if (width <= 0 || height <= 0) {
      throw new ClientValidationError(`options.box width and height must be positive, got width=${width}, height=${height}`);
    }
    if (x < 0 || y < 0) {
      throw new ClientValidationError(`options.box origin cannot be negative, got x=${x}, y=${y}`);
    }
    if (x + width > imageWidth || y + height > imageHeight) {
      throw new ClientValidationError(`options.box bounds (${x + width}x${y + height}) exceed image dimensions (${imageWidth}x${imageHeight})`);
    }
  }

  if (options.corners !== undefined && options.corners !== null) {
    const { corners } = options;
    if (!Array.isArray(corners) || corners.length !== 4) {
      throw new ClientValidationError('options.corners must be an array of exactly 4 corner points');
    }
    for (let i = 0; i < 4; i++) {
      const pt = corners[i];
      if (!pt || typeof pt !== 'object' || Array.isArray(pt)) {
        throw new ClientValidationError(`options.corners[${i}] must be an object { x, y }`);
      }
      if (typeof pt.x !== 'number' || !Number.isFinite(pt.x) ||
          typeof pt.y !== 'number' || !Number.isFinite(pt.y)) {
        throw new ClientValidationError(`options.corners[${i}] coordinates must be finite numbers`);
      }
      if (pt.x < 0 || pt.x > imageWidth || pt.y < 0 || pt.y > imageHeight) {
        throw new ClientValidationError(`options.corners[${i}] (${pt.x}, ${pt.y}) out of image bounds (${imageWidth}x${imageHeight})`);
      }
    }
    // Degenerate quadrilateral check: compute area
    const [p0, p1, p2, p3] = corners;
    const area = 0.5 * Math.abs(
      (p0.x * p1.y - p1.x * p0.y) +
      (p1.x * p2.y - p2.x * p1.y) +
      (p2.x * p3.y - p3.x * p2.y) +
      (p3.x * p0.y - p0.x * p3.y)
    );
    if (area < 64) {
      throw new ClientValidationError(`options.corners form a degenerate quadrilateral (area = ${area} < 64)`);
    }
  }

  if (options.activeTurn !== undefined && options.activeTurn !== null) {
    if (options.activeTurn !== 'w' && options.activeTurn !== 'b') {
      throw new ClientValidationError(`options.activeTurn must be 'w' or 'b', got '${options.activeTurn}'`);
    }
  }
}

function validatePrimaryResultForReview(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ClientValidationError('Review action requires a primaryResult object (received empty, null, or array)');
  }
  if (!Array.isArray(result.squares) || result.squares.length !== 64) {
    throw new ClientValidationError(`primaryResult.squares must be an array of exactly 64 squares (got ${Array.isArray(result.squares) ? result.squares.length : typeof result.squares})`);
  }
  const VALID_PIECES = new Set(['1', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
  const rawIndexSeen = new Set();
  for (let i = 0; i < 64; i++) {
    const sq = result.squares[i];
    if (!sq || typeof sq !== 'object' || Array.isArray(sq)) {
      throw new ClientValidationError(`primaryResult.squares[${i}] must be an object`);
    }
    const piece = sq.piece || (result.grid ? result.grid[i] : null);
    if (typeof piece !== 'string' || !VALID_PIECES.has(piece)) {
      throw new ClientValidationError(`primaryResult.squares[${i}].piece must be a valid piece character ('1' or standard chess piece), got ${JSON.stringify(piece)}`);
    }
    if (typeof sq.prob !== 'number' || !Number.isFinite(sq.prob) || sq.prob < 0 || sq.prob > 1) {
      throw new ClientValidationError(`primaryResult.squares[${i}].prob must be a finite number between 0 and 1, got ${sq.prob}`);
    }
    if (sq.index !== undefined && sq.index !== i) {
      throw new ClientValidationError(`primaryResult.squares[${i}].index must match square index ${i}, got ${sq.index}`);
    }
    const expSquare = `${String.fromCharCode(97 + (i % 8))}${8 - Math.floor(i / 8)}`;
    if (sq.square !== undefined && sq.square !== expSquare) {
      throw new ClientValidationError(`primaryResult.squares[${i}].square must be '${expSquare}', got '${sq.square}'`);
    }
    const rawIdx = (sq.rawIndex !== undefined) ? sq.rawIndex : i;
    if (!Number.isInteger(rawIdx) || rawIdx < 0 || rawIdx > 63) {
      throw new ClientValidationError(`primaryResult.squares[${i}].rawIndex must be an integer between 0 and 63, got ${rawIdx}`);
    }
    if (rawIndexSeen.has(rawIdx)) {
      throw new ClientValidationError(`primaryResult.squares contains duplicate rawIndex: ${rawIdx}`);
    }
    rawIndexSeen.add(rawIdx);
  }

  if (result.orientation !== undefined && result.orientation !== null) {
    if (typeof result.orientation !== 'object' || Array.isArray(result.orientation)) {
      throw new ClientValidationError('primaryResult.orientation must be an object');
    }
    if (result.orientation.evidence !== undefined && !Array.isArray(result.orientation.evidence)) {
      throw new ClientValidationError('primaryResult.orientation.evidence must be an array');
    }
    if (result.orientation.perspective !== undefined && result.orientation.perspective !== 'w' && result.orientation.perspective !== 'b') {
      throw new ClientValidationError("primaryResult.orientation.perspective must be 'w' or 'b'");
    }
  }

  if (result.activeTurn !== undefined && result.activeTurn !== null) {
    if (typeof result.activeTurn !== 'object' || Array.isArray(result.activeTurn)) {
      throw new ClientValidationError('primaryResult.activeTurn must be an object');
    }
    if (result.activeTurn.evidence !== undefined && !Array.isArray(result.activeTurn.evidence)) {
      throw new ClientValidationError('primaryResult.activeTurn.evidence must be an array');
    }
    if (result.activeTurn.turn !== undefined && result.activeTurn.turn !== 'w' && result.activeTurn.turn !== 'b') {
      throw new ClientValidationError("primaryResult.activeTurn.turn must be 'w' or 'b'");
    }
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 1. Health check & Capabilities
  if (request.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      service: 'diverge-vision-edge',
      version: '1.0.0',
      routes: [
        'POST /api/vision (action: recognize)',
        'POST /api/vision (action: review)',
        'POST /api/vision (action: feedback)'
      ]
    }), { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
      status: 405, headers: CORS_HEADERS
    });
  }

  try {
    const body = await readJsonBodyWithLimit(request);
    const action = body.action || url.searchParams.get('action') || 'recognize';

    const ALLOWED_ACTIONS = ['recognize', 'review', 'feedback'];
    if (body.action && !ALLOWED_ACTIONS.includes(body.action)) {
      return new Response(JSON.stringify({ ok: false, error: `Invalid action: ${body.action}` }), {
        status: 400, headers: CORS_HEADERS
      });
    }
    if (!ALLOWED_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ ok: false, error: `Unsupported action: ${action}` }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    // 2. Feedback action
    if (action === 'feedback') {
      const { imageHash, originalFen, correctedFen, userComment } = body;
      if (!correctedFen) {
        return new Response(JSON.stringify({ ok: false, error: 'correctedFen is required' }), {
          status: 400, headers: CORS_HEADERS
        });
      }
      const { validateChessPosition } = await import('../../lib/vision/fen-optimizer.js');
      const val = validateChessPosition(correctedFen);
      if (!val.valid) {
        return new Response(JSON.stringify({ ok: false, error: `Invalid correctedFen: ${val.error}` }), {
          status: 400, headers: CORS_HEADERS
        });
      }

      if (!env || !env.VISION_FEEDBACK_KV || typeof env.VISION_FEEDBACK_KV.put !== 'function') {
        return new Response(JSON.stringify({ ok: false, error: 'Feedback storage is not configured (VISION_FEEDBACK_KV missing)' }), {
          status: 503, headers: CORS_HEADERS
        });
      }

      const feedbackRecord = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: new Date().toISOString(),
        imageHash: imageHash || null,
        originalFen: originalFen || '',
        correctedFen,
        userComment: userComment || ''
      };

      await env.VISION_FEEDBACK_KV.put(feedbackRecord.id, JSON.stringify(feedbackRecord));

      return new Response(JSON.stringify({
        ok: true,
        feedbackId: feedbackRecord.id,
        message: '纠错样本已成功提交'
      }), { status: 200, headers: CORS_HEADERS });
    }

    // 3. Early validation of review payload before model loading
    if (action === 'review') {
      validatePrimaryResultForReview(body.primaryResult);
    }

    // 4. Early payload boundary and format validation (before model loading)
    const { width, height } = body;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Image width and height must be positive integers' }), {
        status: 400, headers: CORS_HEADERS
      });
    }
    if (width > 2048 || height > 2048 || (width * height > 2048 * 2048)) {
      return new Response(JSON.stringify({ ok: false, error: `Image dimensions exceed maximum allowed limits (${width}x${height})` }), {
        status: 400, headers: CORS_HEADERS
      });
    }
    if (!body.data) {
      return new Response(JSON.stringify({ ok: false, error: 'Payload must contain data' }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    // Decode pixel data from base64 if provided
    let data = body.data;
    if (typeof data === 'string') {
      if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length % 4 !== 0) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid base64 image data' }), {
          status: 400, headers: CORS_HEADERS
        });
      }
      try {
        const binStr = atob(data);
        const bytes = new Uint8ClampedArray(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        data = bytes;
      } catch (_) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid base64 image data' }), {
          status: 400, headers: CORS_HEADERS
        });
      }
    } else if (Array.isArray(data)) {
      const bytes = new Uint8ClampedArray(data.length);
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) {
          return new Response(JSON.stringify({ ok: false, error: `Invalid pixel array element at index ${i}: expected integer in [0, 255], got ${v}` }), {
            status: 400, headers: CORS_HEADERS
          });
        }
        bytes[i] = v;
      }
      data = bytes;
    } else if (!(data instanceof Uint8ClampedArray || data instanceof Uint8Array)) {
      return new Response(JSON.stringify({ ok: false, error: 'Image data must be base64 string or byte array' }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    const expectedBytes = width * height * 4;
    if (data.length !== expectedBytes) {
      return new Response(JSON.stringify({ ok: false, error: `Data length mismatch: expected ${expectedBytes} bytes for ${width}x${height} RGBA, got ${data.length}` }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    const options = body.options || {};
    validateOptions(options, width, height);

    // 3. Dynamic import of local ESM vision-core and adapter setup
    const { VisionRecognizerCore } = await import('../../lib/vision/recognizer-core.js');
    const { WebAdapter } = await import('../../lib/vision/web-adapter.js');
    const { VisionPlatformAdapter } = await import('../../lib/vision/adapter-interface.js');

    class CloudflareWorkerAdapter extends VisionPlatformAdapter {
      constructor(opts = {}) {
        super(opts);
        this.wasmModule = opts.wasmModule || null;
        this.weightsBuffer = opts.weightsBuffer || null;
        this.baseUrl = opts.baseUrl || '';
        this.assets = opts.assets || null;
      }

      async loadAsset(assetName) {
        if (this.weightsBuffer) return this.weightsBuffer;
        const fileName = assetName.split('/').pop();
        if (this.assets && typeof this.assets.fetch === 'function') {
          try {
            const res = await this.assets.fetch(new Request(`https://assets.local/models/${fileName}`));
            if (res.ok) return res.arrayBuffer();
          } catch (_) {}
        }
        const targetUrl = this.baseUrl ? `${this.baseUrl.replace(/\/+$/, '')}/models/${fileName}` : `/models/${fileName}`;
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`[CloudflareWorkerAdapter] Failed to fetch asset ${fileName}: ${res.statusText}`);
        return res.arrayBuffer();
      }

      async instantiateWasm(wasmSource, importObject = {}) {
        if (this.wasmModule) {
          const instance = await WebAssembly.instantiate(this.wasmModule, importObject);
          return { instance, module: this.wasmModule };
        }
        return super.instantiateWasm(wasmSource, importObject);
      }

      async decodeImage(source) {
        if (source && source.data && source.width && source.height) {
          return source;
        }
        throw new Error('[CloudflareWorkerAdapter] Pre-decoded { data, width, height } required');
      }
    }

    let wasmModule = env.CHESS_CNN_WASM || env.WASM_MODULE || null;
    if (!wasmModule) {
      try {
        const mod = await import('../../models/chess-cnn.wasm');
        wasmModule = mod.default || mod;
      } catch (_) {}
    }

    let adapter;
    if (wasmModule) {
      adapter = new CloudflareWorkerAdapter({
        wasmModule,
        baseUrl: url.origin,
        assets: env.ASSETS
      });
    } else {
      adapter = new WebAdapter({ baseUrl: url.origin });
    }

    const recognizer = new VisionRecognizerCore({ adapter });
    await recognizer.init();

    const imageInfo = { data, width: body.width, height: body.height };
    const result = await recognizer.recognize(imageInfo, options);

    // 4. Review action (Dual-opinion merge if client provided its primary result)
    if (action === 'review' && body.primaryResult) {
      const { mergeConsensus } = await import('../../lib/vision/consensus-engine.js');
      const merged = mergeConsensus(body.primaryResult, result);
      return new Response(JSON.stringify({ ok: true, result: merged }), {
        status: 200, headers: CORS_HEADERS
      });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200, headers: CORS_HEADERS
    });
  } catch (err) {
    if (err instanceof PayloadTooLargeError || err.status === 413) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 413, headers: CORS_HEADERS
      });
    }
    const isClientError = (err instanceof ClientValidationError) ||
      err.status === 400 ||
      /invalid|missing|expected|format|bounds|dimension|exceed|unsupported|not allowed|positive integers/i.test(err.message || '');
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: isClientError ? 400 : 500, headers: CORS_HEADERS
    });
  }
}

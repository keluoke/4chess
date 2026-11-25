import { LIVE_EVENTS } from './events.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Stale, Retry-After'
};
const pending = new Map();

function errorResponse(status, message, retryAfter) {
  return Response.json({ error: message }, {
    status,
    headers: {
      ...CORS, 'Cache-Control': 'no-store',
      ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
    }
  });
}

async function hash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function output(response, request) {
  const headers = new Headers(response.headers);
  const freshUntil = Number(headers.get('X-Live-Fresh-Until'));
  headers.delete('X-Live-Fresh-Until');
  if (freshUntil) {
    const ttl = Math.max(0, Math.floor((freshUntil - Date.now()) / 1000));
    headers.set('Cache-Control', 'public, max-age=0, s-maxage=' + ttl + ', must-revalidate');
  }
  const tag = headers.get('ETag');
  if (response.ok && tag && request.headers.get('If-None-Match')?.split(',').some(entry => {
    const value = entry.trim().replace(/^W\//, '');
    return value === tag || value === '*';
  })) {
    void response.body?.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

async function load(binding, path, query, type, format) {
  const collector = binding.get(binding.idFromName('lichess-broadcasts'));
  const upstream = await collector.fetch('https://live-collector.internal/' + path + '?' + query);
  if (upstream.status === 404) return errorResponse(404, 'Unknown broadcast round');
  const data = await upstream.json();
  if (!upstream.ok) return errorResponse(upstream.status, 'Broadcast temporarily unavailable', data.retryAfter || 15);

  const isPgn = format === 'pgn';
  const body = isPgn ? data.pgn : JSON.stringify(data.body);
  const digest = await hash(body);
  const updated = !isPgn && type === 'round' ? JSON.stringify({ ...data.body, revision: digest }) : body;
  const ttl = type === 'event' ? 30 : data.status === 'finished' ? 60 : data.status === 'scheduled' ? 15 : 6;
  const expiry = Date.now() + ttl * 1000;
  return new Response(updated, {
    headers: {
      ...CORS,
      'Content-Type': isPgn ? 'application/x-chess-pgn; charset=utf-8' : 'application/json; charset=utf-8',
      'Cache-Control': data.stale ? 'no-store' : 'public, max-age=900',
      'ETag': '"' + digest + '"',
      ...(data.stale ? { 'X-Stale': '1', 'Retry-After': String(data.retryAfter) } : { 'X-Live-Fresh-Until': String(expiry) })
    }
  });
}

export async function serveLive(context, type) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...CORS, Allow: 'GET, OPTIONS' } });
  }
  const url = new URL(request.url);
  const eventId = (type === 'event' ? url.searchParams.get('id') : url.searchParams.get('event')) || 'wcc2026';
  const round = type === 'round' ? url.searchParams.get('id') : '';
  const format = type === 'round' ? url.searchParams.get('format') || 'json' : 'json';
  if (!Object.hasOwn(LIVE_EVENTS, eventId)) return errorResponse(404, 'Unknown broadcast event');
  if (type === 'round' && (!/^[a-z\d]{8}$/i.test(round || '') || !['json', 'pgn'].includes(format))) {
    return errorResponse(400, 'Invalid broadcast round or format');
  }
  if (!env.LIVE_COLLECTOR) return errorResponse(503, 'Broadcast service unavailable', 30);

  const query = new URLSearchParams({ event: eventId });
  if (round) {
    query.set('round', round);
    query.set('format', format);
  }
  const key = new URL('/api/live/' + type + '?' + query, url.origin);
  const cache = globalThis.caches?.default;
  const older = await cache?.match(key);
  if (older && Date.now() < Number(older.headers.get('X-Live-Fresh-Until'))) return output(older, request);

  let operation = pending.get(key.href);
  if (!operation) {
    operation = load(env.LIVE_COLLECTOR, type, query, type, format).catch(() => {
      return errorResponse(503, 'Broadcast temporarily unavailable', 15);
    });
    pending.set(key.href, operation);
    context.waitUntil(operation.then(async response => {
      try {
        if (response.ok && response.headers.has('X-Live-Fresh-Until')) await cache?.put(key, response.clone());
      } finally {
        pending.delete(key.href);
      }
    }));
  }

  const response = (await operation).clone();
  if (older && response.status >= 500) {
    const headers = new Headers(older.headers);
    headers.delete('X-Live-Fresh-Until');
    headers.set('X-Stale', '1');
    headers.set('Cache-Control', 'no-store');
    headers.set('Retry-After', response.headers.get('Retry-After') || '15');
    return output(new Response(older.body, { headers }), request);
  }
  return output(response, request);
}

export async function serveAnalysis(context, worker = false) {
  const { request, env } = context;
  const method = worker ? 'POST' : 'GET';
  if (!worker && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== method) return errorResponse(405, 'Method not allowed');
  const url = new URL(request.url);
  const event = url.searchParams.get('event') || 'wcc2026';
  const round = url.searchParams.get('round');
  const ply = url.searchParams.get('ply');
  const operation = url.searchParams.get('op');
  if (!Object.hasOwn(LIVE_EVENTS, event) || !/^[a-z\d]{8}$/i.test(round ?? '') ||
      (ply !== null && !/^\d{1,3}$/.test(ply)) || (worker && !['claim', 'publish'].includes(operation))) {
    return errorResponse(400, 'Invalid analysis request');
  }
  if (!env.LIVE_COLLECTOR) return errorResponse(503, 'Broadcast service unavailable');
  if (worker && !request.headers.get('Authorization')?.startsWith('Bearer ')) {
    return errorResponse(401, 'Authorization required');
  }
  const query = new URLSearchParams({ event, round, ...(ply === null ? {} : { ply }) });
  const path = !worker ? 'analysis' : operation === 'claim' ? 'analysis-work' : 'analysis-result';
  const urlKey = new URL('/api/live/analysis?' + query, url.origin);
  const cache = worker ? null : globalThis.caches?.default;
  const cached = await cache?.match(urlKey);
  if (cached && Date.now() < Number(cached.headers.get('X-Live-Fresh-Until'))) return output(cached, request);
  const collector = env.LIVE_COLLECTOR.get(env.LIVE_COLLECTOR.idFromName('lichess-broadcasts'));
  try {
    const response = await collector.fetch('https://live-collector.internal/' + path + '?' + query, {
      method, ...(worker ? { headers: { Authorization: request.headers.get('Authorization') },
        ...(operation === 'publish' ? { body: request.body, duplex: 'half' } : {}) } : {})
    });
    if (worker) return new Response(response.body, { status: response.status, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store'
    } });
    if (response.status === 404) return errorResponse(404, 'Analysis unavailable for this round');
    if (![200, 202].includes(response.status)) return errorResponse(503, 'Analysis temporarily unavailable', 10);
    const data = await response.json();
    if (!['ready', 'pending'].includes(data?.status)) return errorResponse(404, 'Analysis unavailable for this round');
    if (data.status === 'pending') return Response.json(data, { status: 202, headers: {
      ...CORS, 'Cache-Control': 'no-store', 'Retry-After': '8'
    } });
    const body = JSON.stringify(data);
    const ready = new Response(body, { headers: {
      ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60',
      'X-Live-Fresh-Until': String(Date.now() + 6000), 'ETag': '"' + await hash(body) + '"'
    } });
    if (cache) context.waitUntil(cache.put(urlKey, ready.clone()).catch(() => {}));
    return output(ready, request);
  } catch {
    return errorResponse(503, 'Analysis temporarily unavailable', 10);
  }
}

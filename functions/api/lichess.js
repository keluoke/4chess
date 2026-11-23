/**
 * Cloudflare Pages Function: /api/lichess
 * Edge proxy for Lichess user game exports (adds required User-Agent, validation, timeouts & CORS).
 */

const USERNAME_REGEX = /^[A-Za-z0-9_-]{2,30}$/;

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'GET',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const url = new URL(context.request.url);
  const username = (url.searchParams.get('username') || '').trim();
  if (!USERNAME_REGEX.test(username)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid or missing Lichess username' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const rawMax = Number.parseInt(url.searchParams.get('max') || '10', 10);
  const clocks = url.searchParams.get('clocks') === 'true';
  const max = Number.isFinite(rawMax) ? Math.max(1, Math.min(clocks ? 100 : 10, rawMax)) : 10;
  const targetUrl = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&pgnInJson=true&clocks=${clocks}&opening=${clocks}&evals=false&finished=true&ongoing=false&perfType=bullet,blitz,rapid,classical`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/x-ndjson',
        'User-Agent': 'DivergeChess/1.2 (+https://4chess.cc)'
      },
      signal: AbortSignal.timeout(clocks ? 20000 : 8000)
    });

    const bodyText = await response.text();
    return new Response(bodyText, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/x-ndjson; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Lichess upstream request failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

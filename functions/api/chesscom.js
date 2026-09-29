/**
 * Cloudflare Pages Function: /api/chesscom
 * Secure edge proxy for Chess.com game callbacks (adds User-Agent, validation, timeouts & CORS).
 */

const ALLOWED_TYPES = new Set(['live', 'daily']);
const GAME_ID_REGEX = /^\d{8,16}$/;

export async function onRequest(context) {
  // 1. Enforce GET only
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
  const rawId = url.searchParams.get('id') || '';
  const cleanId = rawId.trim();

  // 2. Validate Game ID strictly against regex
  if (!GAME_ID_REGEX.test(cleanId)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid or missing game ID (must be 8-16 digits)' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 3. Whitelist Game Type
  const reqType = (url.searchParams.get('type') || '').trim().toLowerCase();
  const primaryType = ALLOWED_TYPES.has(reqType) ? reqType : 'live';
  const secondaryType = primaryType === 'live' ? 'daily' : 'live';
  const candidateTypes = [primaryType, secondaryType];

  // 4. Fetch with AbortSignal timeout (5000ms)
  for (const type of candidateTypes) {
    try {
      const targetUrl = `https://www.chess.com/callback/${type}/game/${cleanId}`;
      const response = await fetch(targetUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) 4ChessReview/1.0'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const bodyText = await response.text();
        return new Response(bodyText, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }
    } catch (e) {
      // Continue to fallback type
    }
  }

  return new Response(JSON.stringify({ ok: false, error: '未能从 Chess.com 获取该对局' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

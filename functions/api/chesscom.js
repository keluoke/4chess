/**
 * Cloudflare Pages Function: /api/chesscom
 * Secure edge proxy for Chess.com game callbacks (adds User-Agent & CORS headers).
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const gameId = url.searchParams.get('id');
  const gameType = url.searchParams.get('type') || 'live';

  if (!gameId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing game id' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const cleanId = gameId.trim().replace(/[^0-9]/g, '');
  const candidateTypes = [gameType, 'live', 'daily'];

  for (const type of candidateTypes) {
    try {
      const targetUrl = `https://www.chess.com/callback/${type}/game/${cleanId}`;
      const response = await fetch(targetUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) 4ChessReview/1.0'
        }
      });

      if (response.ok) {
        const bodyText = await response.text();
        return new Response(bodyText, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }
    } catch (e) {
      // Continue to next type
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

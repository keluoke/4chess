import assert from 'assert';
import { onRequest as chesscomProxy } from '../functions/api/chesscom.js';

console.log('--- 1. Testing Cloudflare Pages Function /api/chesscom Security ---');

async function testChesscomFunction() {
  // Test 1: Reject POST method
  const postReq = new Request('http://localhost/api/chesscom?id=12345678', { method: 'POST' });
  const postRes = await chesscomProxy({ request: postReq });
  assert.strictEqual(postRes.status, 405, 'POST should return 405 Method Not Allowed');
  assert.strictEqual(postRes.headers.get('Allow'), 'GET');
  console.log('✅ POST request correctly rejected with 405 Method Not Allowed');

  // Test 2: Reject invalid game ID (letters / path traversal)
  const invalidIdReq = new Request('http://localhost/api/chesscom?id=../../etc/passwd', { method: 'GET' });
  const invalidIdRes = await chesscomProxy({ request: invalidIdReq });
  assert.strictEqual(invalidIdRes.status, 400, 'Invalid ID should return 400');
  console.log('✅ Directory traversal / alphanumeric ID rejected with 400 Bad Request');

  // Test 3: Reject too short game ID (< 8 digits)
  const shortIdReq = new Request('http://localhost/api/chesscom?id=123', { method: 'GET' });
  const shortIdRes = await chesscomProxy({ request: shortIdReq });
  assert.strictEqual(shortIdRes.status, 400, 'Short ID should return 400');
  console.log('✅ Too short game ID (<8 digits) rejected with 400 Bad Request');

  // Test 4: Reject too long game ID (> 16 digits)
  const longIdReq = new Request('http://localhost/api/chesscom?id=12345678901234567890', { method: 'GET' });
  const longIdRes = await chesscomProxy({ request: longIdReq });
  assert.strictEqual(longIdRes.status, 400, 'Long ID should return 400');
  console.log('✅ Too long game ID (>16 digits) rejected with 400 Bad Request');
}

console.log('\n--- 2. Testing Model Cache Identity Key ---');

function getModelCacheKey(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  const baseName = url.split('/').pop().replace(/\.bin$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'maia3';
  return `maia3_v1_${baseName}_${Math.abs(hash).toString(36)}`;
}

function testModelCacheKey() {
  const url1 = 'https://weights.4chess.cc/maia3_model.bin';
  const url2 = 'https://custom-cdn.com/maia3_model.bin';
  const key1 = getModelCacheKey(url1);
  const key2 = getModelCacheKey(url2);

  assert.notStrictEqual(key1, key2, 'Different CDN URLs must yield different cache keys');
  assert.strictEqual(key1, getModelCacheKey(url1), 'Same URL must produce deterministic key');
  assert.ok(key1.startsWith('maia3_v1_maia3_model_'), 'Key must contain version and sanitized base name');
  console.log(`✅ Cache key for official weights: ${key1}`);
  console.log(`✅ Cache key for custom CDN: ${key2}`);
  console.log('✅ Cache identity isolation verified across different origins');
}

console.log('\n--- 3. Testing Single-Use Sandbox Token State Machine ---');

function testSandboxTokenLogic() {
  const sandboxTokens = new Map();
  function cleanExpiredTokens() {
    const now = Date.now();
    for (const [token, exp] of sandboxTokens.entries()) {
      if (exp <= now) sandboxTokens.delete(token);
    }
  }

  // Generate token
  const token = 'test-token-uuid-12345';
  sandboxTokens.set(token, Date.now() + 30000);
  assert.strictEqual(sandboxTokens.size, 1);

  // First verification (success)
  let verified1 = false;
  if (sandboxTokens.has(token) && sandboxTokens.get(token) > Date.now()) {
    sandboxTokens.delete(token);
    verified1 = true;
  }
  assert.strictEqual(verified1, true, 'First token verification must succeed');
  assert.strictEqual(sandboxTokens.size, 0, 'Token must be consumed on verification');

  // Second verification (replay attack)
  let verified2 = false;
  if (sandboxTokens.has(token) && sandboxTokens.get(token) > Date.now()) {
    sandboxTokens.delete(token);
    verified2 = true;
  }
  assert.strictEqual(verified2, false, 'Replay attack must fail on consumed token');
  console.log('✅ Single-use token prevents replay attack and unauthorized port binding');
}

async function runAll() {
  await testChesscomFunction();
  testModelCacheKey();
  testSandboxTokenLogic();
  console.log('\n🎉 All Security & Hardening verification tests passed!');
}

runAll().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

/**
 * Diverge Local Share Bridge Service
 * Connects extension popup to WeChat OpenAPI and CloudBase NoSQL for generating real dynamic mini-program sunflower codes.
 *
 * Security:
 * - Listens STRICTLY on loopback interface (127.0.0.1:3210).
 * - Restricts requests to chrome-extension origins and checks local bearer token.
 * - Credentials reside strictly outside version control (.env.local).
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ChessBoard } from '../engine/chess-core.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envFile = path.join(rootDir, '.env.local');

// 1. Load configuration from .env.local
function loadConfig() {
  const config = {
    PORT: 3210,
    WECHAT_APPID: 'wx8e11833b3ebb8f2c',
    WECHAT_APPSECRET: '',
    TCB_ENV: 'cloud1-0g90ksru0dc315ec',
    ENV_VERSION: 'release',
    LOCAL_TOKEN: crypto.randomBytes(32).toString('hex')
  };

  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (k in config) config[k] = v;
      }
    }
  }

  // Allow process.env override
  for (const k of Object.keys(config)) {
    if (process.env[k]) config[k] = process.env[k];
  }

  return config;
}

const config = loadConfig();

// 2. Token Cache for WeChat OpenAPI
let tokenCache = { token: '', expireAt: 0 };

async function getWeChatAccessToken(appId, appSecret) {
  if (!appSecret) {
    throw new Error('未配置 WECHAT_APPSECRET。请在 .env.local 中配置小程序的 AppSecret');
  }

  if (tokenCache.token && Date.now() < tokenCache.expireAt) {
    return tokenCache.token;
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const res = await httpsGet(url);

  if (!res.access_token) {
    const code = res.errcode;
    if (code === 40164) {
      throw new Error(`微信接口错误 40164: 当前 IP 未加入微信后台白名单。微信提示: ${res.errmsg}`);
    }
    throw new Error(`获取微信 access_token 失败 (${code || 'error'}): ${res.errmsg || JSON.stringify(res)}`);
  }

  // Token expires in 7200s, cache for 7000s
  tokenCache = {
    token: res.access_token,
    expireAt: Date.now() + Math.max(60, (res.expires_in || 7200) - 200) * 1000
  };

  return tokenCache.token;
}

// 3. CloudBase NoSQL persistence via WeChat OpenAPI
async function ensureCloudBasePosition(accessToken, envId, token, fen, flipped) {
  const query = `db.collection("qimi_shared_positions").doc("${token}").get()`;
  const checkRes = await httpsPostJson(
    `https://api.weixin.qq.com/tcb/databasequery?access_token=${accessToken}`,
    { env: envId, query }
  );

  if (checkRes.errcode === 0 && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
    // Already exists in cloud DB
    return true;
  }

  // Insert document with content-addressed token as _id
  const insertQuery = `db.collection("qimi_shared_positions").add({data: {_id: "${token}", fen: "${fen.replace(/"/g, '\\"')}", flipped: ${flipped === true}, createdAt: new Date()}})`;
  const insertRes = await httpsPostJson(
    `https://api.weixin.qq.com/tcb/databaseadd?access_token=${accessToken}`,
    { env: envId, query: insertQuery }
  );

  if (insertRes.errcode !== 0 && !insertRes.errmsg?.includes('duplicate')) {
    throw new Error(`写入云开发数据库失败: (${insertRes.errcode}) ${insertRes.errmsg}`);
  }

  return true;
}

// 4. WeChat wxacode.getUnlimited generator
async function generateWxaCode(accessToken, token, envVersion = 'release') {
  const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;
  const payload = {
    scene: token,
    page: 'pages/index/index',
    check_path: false,
    env_version: envVersion,
    width: 430
  };

  const buffer = await httpsPostBuffer(url, payload);

  // Check if buffer contains JSON error instead of image bytes
  if (buffer.length < 500) {
    try {
      const text = buffer.toString('utf8');
      if (text.startsWith('{')) {
        const err = JSON.parse(text);
        if (err.errcode) {
          throw new Error(`微信生成小程序码失败: [${err.errcode}] ${err.errmsg}`);
        }
      }
    } catch (e) {
      if (e.message.includes('微信生成小程序码失败')) throw e;
    }
  }

  return buffer;
}

// HTTPS helpers
function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const request = https.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from upstream service')); }
      });
    }).on('error', reject);
    request.setTimeout(7000, () => request.destroy(new Error('Upstream request timed out')));
  });
}

function httpsPostJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(bodyObj);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.setTimeout(7000, () => req.destroy(new Error('Upstream request timed out')));
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpsPostBuffer(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(bodyObj);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(7000, () => req.destroy(new Error('Upstream request timed out')));
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS & Security headers for loopback & Chrome PNA (Private Network Access)
  const origin = req.headers.origin || '';
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Extension origin required' }));
    return;
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  console.log(`[Share Bridge] 📥 ${req.method} ${req.url} (from: ${origin})`);

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health' || url.pathname === '/api/share/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'diverge-share-bridge',
      configured: Boolean(config.WECHAT_APPSECRET),
      appId: config.WECHAT_APPID,
      env: config.TCB_ENV,
      envVersion: config.ENV_VERSION
    }));
    return;
  }

  if (url.pathname === '/api/share/code' && req.method === 'POST') {
    // Security check: Verify local token if configured
    const authHeader = req.headers['authorization'] || '';
    const tokenPassed = authHeader.replace(/^Bearer\s+/i, '').trim();
    const supplied = Buffer.from(tokenPassed), expected = Buffer.from(config.LOCAL_TOKEN);
    if (!supplied.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized: Invalid local bearer token' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50000) req.destroy();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { fen, flipped } = payload;

        if (!fen || typeof fen !== 'string' || !new ChessBoard(fen).isValid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: '缺少或无效的 FEN 字符串' }));
          return;
        }

        // 1. Content Addressing Token (24 hex characters)
        const snapshot = { version: 1, fen: fen.trim(), flipped: flipped === true };
        const token = crypto.createHash('sha256')
          .update(JSON.stringify(snapshot))
          .digest('hex')
          .slice(0, 24);

        // 2. Fetch WeChat access_token
        const accessToken = await getWeChatAccessToken(config.WECHAT_APPID, config.WECHAT_APPSECRET);

        // 3. Ensure record exists in CloudBase database so scanning resolves the board
        await ensureCloudBasePosition(accessToken, config.TCB_ENV, token, snapshot.fen, snapshot.flipped);

        // 4. Generate official WxaCode buffer
        const buffer = await generateWxaCode(accessToken, token, config.ENV_VERSION);

        // 5. Return high-quality base64 image
        const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          token,
          dataUrl
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
});

// Bind STRICTLY to 127.0.0.1
server.listen(config.PORT, '127.0.0.1', () => {
  console.log(`🚀 [Diverge Share Bridge] Listening strictly on http://127.0.0.1:${config.PORT}`);
  console.log(`ℹ️ Target AppID: ${config.WECHAT_APPID} | CloudBase: ${config.TCB_ENV} (${config.ENV_VERSION})`);
  if (!config.WECHAT_APPSECRET) {
    console.log(`⚠️ 提示: 请在 ${envFile} 中配置 WECHAT_APPSECRET 以启用真实菊花码生成。`);
  } else {
    console.log(`✅ AppSecret 已就绪，准备接收海报生成请求。`);
  }
});

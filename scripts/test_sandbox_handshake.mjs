import assert from 'assert';

console.log('--- Testing Stockfish Sandbox Handshake State Machine ---');

// Mock browser / WebAssembly environment to simulate parent-child handshake
class MockMessagePort {
  constructor() {
    this.other = null;
    this._onmessage = null;
    this.closed = false;
    this.buffer = [];
  }
  get onmessage() {
    return this._onmessage;
  }
  set onmessage(handler) {
    this._onmessage = handler;
    if (handler && this.buffer.length > 0) {
      const q = [...this.buffer];
      this.buffer = [];
      for (const data of q) {
        setTimeout(() => {
          if (!this.closed && this._onmessage) {
            this._onmessage({ data });
          }
        }, 5);
      }
    }
  }
  postMessage(data) {
    if (this.closed) throw new Error('Port is closed');
    if (this.other) {
      if (this.other._onmessage) {
        setTimeout(() => {
          if (!this.other.closed && this.other._onmessage) {
            this.other._onmessage({ data });
          }
        }, 5);
      } else {
        this.other.buffer.push(data);
      }
    }
  }
  close() {
    this.closed = true;
  }
}

function createMockChannel() {
  const p1 = new MockMessagePort();
  const p2 = new MockMessagePort();
  p1.other = p2;
  p2.other = p1;
  return { port1: p1, port2: p2 };
}

// Test 1: Simulating token verification and MessagePort exchange
async function testPortExchange() {
  const activeTokens = new Map();
  const token = 'test-sandbox-uuid-999';
  activeTokens.set(token, Date.now() + 60000);

  let authenticatedPort = null;
  let isPortAuthenticated = false;
  let isInitialized = true;
  let engineName = 'Stockfish 19 Lite WASM';

  const channel = createMockChannel();

  // Child verifies token and activates port
  const candidatePort = channel.port2;
  let verified = false;
  if (activeTokens.has(token) && activeTokens.get(token) > Date.now()) {
    activeTokens.delete(token);
    verified = true;
  }
  assert.strictEqual(verified, true, 'Token must be verified successfully');

  if (verified) {
    authenticatedPort = candidatePort;
    isPortAuthenticated = true;
    authenticatedPort.postMessage({ type: 'PORT_ACK', engineName });
    if (isInitialized) {
      authenticatedPort.postMessage({ type: 'STOCKFISH_READY', engineName });
    }
  }

  // Parent listens on port1
  const receivedMessages = [];
  channel.port1.onmessage = (e) => {
    receivedMessages.push(e.data);
  };

  await new Promise(r => setTimeout(r, 20));

  assert.strictEqual(receivedMessages.length, 2, 'Parent must receive PORT_ACK and STOCKFISH_READY');
  assert.strictEqual(receivedMessages[0].type, 'PORT_ACK');
  assert.strictEqual(receivedMessages[1].type, 'STOCKFISH_READY');
  console.log('✅ Handshake port exchange succeeded with PORT_ACK and STOCKFISH_READY');
}

// Test 2: Simulating Reconnection on SPA navigation / Tab Reuse
async function testReconnection() {
  const activeTokens = new Map();
  let authenticatedPort = null;
  let isPortAuthenticated = false;
  let isInitialized = true;
  const engineName = 'Stockfish 19 Lite WASM';

  function handleAuthPort(candidatePort, token) {
    if (activeTokens.has(token) && activeTokens.get(token) > Date.now()) {
      activeTokens.delete(token);
      if (authenticatedPort && authenticatedPort !== candidatePort) {
        authenticatedPort.close();
      }
      authenticatedPort = candidatePort;
      isPortAuthenticated = true;
      authenticatedPort.postMessage({ type: 'PORT_ACK', engineName });
      if (isInitialized) {
        authenticatedPort.postMessage({ type: 'STOCKFISH_READY', engineName });
      }
      return true;
    } else {
      candidatePort.close();
      return false;
    }
  }

  // Session 1
  const t1 = 'token-sess-1';
  activeTokens.set(t1, Date.now() + 60000);
  const chan1 = createMockChannel();
  const ok1 = handleAuthPort(chan1.port2, t1);
  assert.strictEqual(ok1, true, 'First session must authenticate');

  // Session 2 (reconnection after navigation)
  const t2 = 'token-sess-2';
  activeTokens.set(t2, Date.now() + 60000);
  const chan2 = createMockChannel();
  const ok2 = handleAuthPort(chan2.port2, t2);
  assert.strictEqual(ok2, true, 'Second session must seamlessly re-authenticate');
  assert.strictEqual(chan1.port2.closed, true, 'Previous session port must be closed');

  console.log('✅ Reconnection and graceful port migration verified');
}

async function run() {
  await testPortExchange();
  await testReconnection();
  console.log('🎉 Sandbox handshake state machine tests passed successfully!');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

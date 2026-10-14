import assert from "node:assert/strict";
export async function nativePopup(context, sw, host) {
  await host.bringToFront();
  const session = await context.browser().newBrowserCDPSession();
  const all = await session.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const tab = all.targetInfos.find((t) => t.url === host.url());
  assert(tab);
  await session.send("Extensions.triggerAction", {
    id: new URL(sw.url()).host,
    targetId: tab.targetId,
  });
  let target;
  for (let n = 0; n < 30; n++) {
    const targets = await session.send("Target.getTargets");
    target = targets.targetInfos.find((t) =>
      t.url.includes("/popup/popup.html"),
    );
    if (target) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(target);
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  let serial = 0;
  const pending = new Map();
  session.on("Target.receivedMessageFromTarget", (e) => {
    if (e.sessionId !== sessionId) return;
    const msg = JSON.parse(e.message),
      pair = pending.get(msg.id);
    if (pair) {
      pending.delete(msg.id);
      msg.error
        ? pair.reject(Error(msg.error.message))
        : pair.resolve(msg.result);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(Error("Popup RPC timeout: " + method));
      }, 45000);
      pending.set(id, {
        resolve: (r) => {
          clearTimeout(timeout);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      session
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });
  const run = async (expression) => {
    const r = await rpc("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async (expression, timeout = 30000) =>
    run(
      `new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true)}else if(Date.now()-started>${timeout}){clearInterval(timer);reject(Error('Timed out: '+${JSON.stringify(expression)}))}},25)})`,
    );
  await wait("document.querySelector('#scan-launch')");
  await new Promise((r) => setTimeout(r, 150));
  return { run, wait, rpc, session };
}

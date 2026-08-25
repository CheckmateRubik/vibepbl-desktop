import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const executable = resolve(process.argv[2] || 'src-tauri/target/release/vibepbl-desktop.exe');
const smokeImage = process.env.VIBEPBL_SMOKE_IMAGE;
const port = 9333;
const app = spawn(executable, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'ignore',
  windowsHide: true
});

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url && item.url !== 'about:blank');
      if (page) return page;
    } catch { /* WebView is still starting. */ }
    await delay(250);
  }
  throw new Error('The native WebView did not expose a debug target.');
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
      return;
    }
    if (!pending.has(message.id)) return;
    const { resolveResult, rejectResult } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectResult(new Error(message.error.message));
    else resolveResult(message.result);
  });
  return {
    send(method, params = {}) {
      const requestId = ++id;
      socket.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((resolveResult, rejectResult) => pending.set(requestId, { resolveResult, rejectResult }));
    },
    errors,
    close: () => socket.close()
  };
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

const invokeExpression = (command, args) => `(async () => window.__TAURI__.core.invoke(${JSON.stringify(command)}${args === undefined ? '' : `, ${JSON.stringify(args)}`}))()`;

try {
  const page = await findPage();
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  let bridge;
  for (let attempt = 0; attempt < 40; attempt++) {
    bridge = await client.send('Runtime.evaluate', {
      expression: `({ readyState: document.readyState, hasTauri: Boolean(window.__TAURI__), hasInvoke: typeof window.__TAURI__?.core?.invoke === 'function' })`,
      returnByValue: true
    });
    if (bridge.result.value?.readyState === 'complete' && bridge.result.value?.hasInvoke) break;
    await delay(250);
  }
  const originalSession = await evaluate(client, invokeExpression('get_session'));
  const originalMembers = await evaluate(client, invokeExpression('get_members'));
  const testMemberName = `Native Smoke ${Date.now()}`;
  let testMember;
  const fieldMap = {
    title: originalSession.title,
    theme: originalSession.theme,
    case_text: originalSession.caseText,
    case_images: originalSession.caseImages,
    terms: originalSession.terms,
    timeline: originalSession.timeline,
    problems: originalSession.problems,
    objectives: originalSession.objectives,
    presenter_assignments: originalSession.presenterAssignments,
    is_act1_completed: originalSession.isAct1Completed
  };
  const samples = {
    title: 'Native release smoke test',
    theme: 'midnight',
    case_text: '<p>Representative clinical narrative</p>',
    case_images: smokeImage ? [{ id:'image-smoke', filename:'image-smoke.png', originalName:'Smoke test image.png', localPath:smokeImage, pins:[{ id:'pin-smoke', x:50, y:50, label:'Representative finding' }] }] : [],
    terms: [{ id:'term-smoke', name:'Dyspnea', meaning:'Subjective breathing discomfort' }],
    timeline: [{ id:'time-smoke', content:'Symptoms progressed', durationText:'2 weeks prior', colorTheme:{ name:'Slate', bg:'#f1f5f9', text:'#334155', border:'#94a3b8' } }],
    problems: [{ id:'prob-smoke', text:'Progressive dyspnea', status:'none', hypotheses:[{ id:'hyp-smoke', text:'Pulmonary infection', status:'none', validation:'wrong', checked:false }] }],
    objectives: [{ id:'lo-smoke', text:'Compare causes of dyspnea', linkedProblemIds:['prob-smoke'] }],
    presenter_assignments: { 'lo-smoke_prob-smoke': testMemberName },
    is_act1_completed: false
  };
  try {
    for (const [fieldName, value] of Object.entries(samples)) {
      await evaluate(client, invokeExpression('save_session_field', { fieldName, jsonValue:JSON.stringify(value) }));
    }
    const saved = await evaluate(client, invokeExpression('get_session'));
    if (saved.title !== samples.title || saved.terms[0]?.name !== 'Dyspnea' || saved.problems[0]?.hypotheses[0]?.validation !== 'wrong') {
      throw new Error(`Session round-trip failed: ${JSON.stringify(saved)}`);
    }
    const printPayload = await evaluate(client, invokeExpression('get_print_act1_data'));
    if (printPayload.session.title !== samples.title || printPayload.session.objectives.length !== 1) throw new Error('Print payload did not match the session.');

    testMember = await evaluate(client, invokeExpression('add_member', { name:testMemberName }));
    const membersAfterAdd = await evaluate(client, invokeExpression('get_members'));
    if (!membersAfterAdd.some(member => member.id === testMember.id)) throw new Error('Roster add/get round-trip failed.');

    const invalidFieldRejected = await evaluate(client, `(async () => { try { await window.__TAURI__.core.invoke('save_session_field', { fieldName:'unsafe_field', jsonValue:'null' }); return false; } catch (error) { return String(error).includes('Unsupported session field'); } })()`);
    if (!invalidFieldRejected) throw new Error('Native field allow-list did not reject an unsafe field.');

    await client.send('Page.reload');
    await delay(800);
    const expectedRoutes = {
      case:'Case materials', terms:'Terminology clarifier', timeline:'Clinical timeline', problems:'Problems & hypotheses',
      objectives:'Learning objectives', randomizer:'Presenter randomizer', verification:'Hypotheses verification', settings:'Session & settings'
    };
    const routeResults = {};
    for (const [route, expectedHeading] of Object.entries(expectedRoutes)) {
      await evaluate(client, `location.hash = '#/${route}'`);
      await delay(180);
      routeResults[route] = await evaluate(client, `({ heading:document.querySelector('#page h2')?.textContent, text:document.querySelector('#page')?.innerText })`);
      if (routeResults[route].heading !== expectedHeading) throw new Error(`Route ${route} rendered ${routeResults[route].heading} instead of ${expectedHeading}.`);
    }
    if (!routeResults.terms.text.includes('Dyspnea') || !routeResults.timeline.text.includes('Symptoms progressed')) throw new Error('Act 1 representative data did not render.');
    if (!routeResults.problems.text.includes('Wrong') || !routeResults.verification.text.includes('Wrong')) throw new Error('Act 1/Act 2 hypothesis status was not synchronized.');
    if (!routeResults.randomizer.text.includes(testMemberName) || !routeResults.objectives.text.includes('Compare causes of dyspnea')) throw new Error('Act 2 assignment or objective mapping did not render.');
    if (smokeImage) {
      await evaluate(client, `location.hash = '#/case'`);
      let imageState;
      for (let attempt = 0; attempt < 20; attempt++) {
        imageState = await evaluate(client, `(() => { const image = document.querySelector('.image-card img'); return image && { complete:image.complete, naturalWidth:image.naturalWidth, alt:image.alt }; })()`);
        if (imageState?.complete && imageState.naturalWidth > 0) break;
        await delay(100);
      }
      if (!imageState?.complete || imageState.naturalWidth < 1 || imageState.alt !== 'Smoke test image.png') throw new Error(`Private clinical image did not render: ${JSON.stringify(imageState)}`);
    }

    await evaluate(client, invokeExpression('remove_member', { id:testMember.id }));
    testMember = undefined;
    const membersAfterRemove = await evaluate(client, invokeExpression('get_members'));
    if (membersAfterRemove.length !== originalMembers.length) throw new Error('Roster cleanup failed.');

    const result = { page:{ title:page.title, url:page.url }, bridge:bridge.result.value, session:{ id:saved.id, title:saved.title }, routes:Object.keys(routeResults), nativeErrors:client.errors };
    if (!result.bridge.hasTauri || !result.bridge.hasInvoke || result.session.id !== 1 || client.errors.length) {
      throw new Error(`Native bridge check failed: ${JSON.stringify(result)}`);
    }
    console.log(`Native release checks OK: ${JSON.stringify(result)}`);
  } finally {
    if (testMember) await evaluate(client, invokeExpression('remove_member', { id:testMember.id })).catch(() => {});
    for (const [fieldName, value] of Object.entries(fieldMap)) {
      await evaluate(client, invokeExpression('save_session_field', { fieldName, jsonValue:JSON.stringify(value) })).catch(() => {});
    }
  }
  client.close();
} finally {
  app.kill();
}

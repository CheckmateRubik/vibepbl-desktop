import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const executable = resolve(process.argv[2] || 'src-tauri/target/release/vibepbl-desktop.exe');
const smokeImage = process.env.VIBEPBL_SMOKE_IMAGE;
const dataDirectory = await mkdtemp(join(tmpdir(), 'vibepbl-native-check-'));
const resetSentinel = join(dataDirectory, 'images', 'reset-check.png');
await mkdir(join(dataDirectory, 'images'), { recursive:true });
await writeFile(resetSentinel, 'private image copy');
const port = 9333;
const app = spawn(executable, [], {
  env: {
    ...process.env,
    VIBEPBL_DATA_DIR: dataDirectory,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
  },
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
      socket.send(JSON.stringify({ id:requestId, method, params }));
      return new Promise((resolveResult, rejectResult) => pending.set(requestId, { resolveResult, rejectResult }));
    },
    errors,
    close: () => socket.close()
  };
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

const invokeExpression = (command, args) => `(async () => window.__TAURI__.core.invoke(${JSON.stringify(command)}${args === undefined ? '' : `, ${JSON.stringify(args)}`}))()`;

let client;
try {
  const page = await findPage();
  client = await connect(page.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  let bridge;
  for (let attempt = 0; attempt < 40; attempt++) {
    bridge = await client.send('Runtime.evaluate', {
      expression: `({ readyState:document.readyState, hasTauri:Boolean(window.__TAURI__), hasInvoke:typeof window.__TAURI__?.core?.invoke === 'function' })`,
      returnByValue:true
    });
    if (bridge.result.value?.readyState === 'complete' && bridge.result.value?.hasInvoke) break;
    await delay(250);
  }

  const testMemberName = `Isolated check ${Date.now()}`;
  const samples = {
    title: 'ทดสอบการแสดงผลภาษาไทย',
    theme: 'retro',
    case_text: '',
    case_images: smokeImage ? [{ id:'image-check', filename:'image-check.png', originalName:'ภาพกรณีศึกษา.png', localPath:smokeImage, highlights:[{ id:'highlight-check', x:18, y:22, width:34, height:12 }] }] : [],
    terms: [{ id:'term-check', name:'หายใจลำบาก', meaning:'อาการไม่สบายขณะหายใจ' }],
    timeline: [{ id:'time-check', content:'อาการแย่ลง', durationText:'2 สัปดาห์ก่อน', colorTheme:{ name:'Slate', bg:'#f1f5f9', text:'#334155', border:'#94a3b8' } }],
    problems: [{ id:'prob-check', text:'หายใจลำบากมากขึ้น', status:'none', hypotheses:[{ id:'hyp-check', text:'การติดเชื้อในปอด', status:'none', validation:'wrong', checked:false }] }],
    objectives: [{ id:'lo-check', text:'เปรียบเทียบสาเหตุของอาการหายใจลำบาก', linkedProblemIds:['prob-check'] }],
    presenter_assignments: { 'lo-check_prob-check':testMemberName },
    is_act1_completed: false
  };
  for (const [fieldName, value] of Object.entries(samples)) {
    await evaluate(client, invokeExpression('save_session_field', { fieldName, jsonValue:JSON.stringify(value) }));
  }
  const saved = await evaluate(client, invokeExpression('get_session'));
  if (saved.title !== samples.title || saved.terms[0]?.name !== 'หายใจลำบาก' || saved.problems[0]?.hypotheses[0]?.validation !== 'wrong') {
    throw new Error(`Session round-trip failed: ${JSON.stringify(saved)}`);
  }
  const printPayload = await evaluate(client, invokeExpression('get_print_act1_data'));
  if (printPayload.session.title !== samples.title || printPayload.session.objectives.length !== 1) throw new Error('Print payload did not match the session.');

  const testMember = await evaluate(client, invokeExpression('add_member', { name:testMemberName }));
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
  if (routeResults.case.text.includes('Clinical narrative') || await evaluate(client, `Boolean(document.querySelector('#case-editor,.toolbar,.pin,.pin-index'))`)) throw new Error('Removed narrative or pin controls are still present.');
  if (!routeResults.terms.text.includes('หายใจลำบาก') || !routeResults.timeline.text.includes('อาการแย่ลง')) throw new Error('Thai Act 1 data did not render.');
  if (!routeResults.problems.text.includes('Wrong') || !routeResults.verification.text.includes('Wrong')) throw new Error('Act 1/Act 2 hypothesis status was not synchronized.');
  if (!routeResults.randomizer.text.includes(testMemberName) || !routeResults.objectives.text.includes('เปรียบเทียบสาเหตุของอาการหายใจลำบาก')) throw new Error('Thai Act 2 assignment or objective mapping did not render.');

  const retroState = await evaluate(client, `({ theme:document.documentElement.dataset.theme, shell:getComputedStyle(document.querySelector('.app-shell')).display, sidebar:getComputedStyle(document.querySelector('.sidebar')).position, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth })`);
  if (retroState.theme !== 'retro' || retroState.shell !== 'grid' || retroState.sidebar !== 'sticky' || retroState.overflow) throw new Error(`Retro theme changed the app structure or overflowed: ${JSON.stringify(retroState)}`);

  await client.send('Emulation.setDeviceMetricsOverride', { width:1000, height:720, deviceScaleFactor:1, mobile:false });
  await delay(300);
  const narrowState = await evaluate(client, `(() => { window.scrollTo({ left:700, top:window.scrollY }); const main=document.querySelector('.main-shell').getBoundingClientRect(); return { shell:getComputedStyle(document.querySelector('.app-shell')).display, sidebar:getComputedStyle(document.querySelector('.sidebar')).position, mainWidth:main.width, menu:getComputedStyle(document.querySelector('#sidebar-toggle')).display, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollX:window.scrollX }; })()`);
  if (narrowState.shell !== 'block' || narrowState.sidebar !== 'fixed' || narrowState.mainWidth < 900 || narrowState.menu === 'none' || narrowState.overflow || narrowState.scrollX !== 0) throw new Error(`Narrow workspace can move or collapse: ${JSON.stringify(narrowState)}`);
  await client.send('Emulation.clearDeviceMetricsOverride');

  if (smokeImage) {
    await evaluate(client, `location.hash = '#/case'`);
    await delay(180);
    await evaluate(client, `document.querySelector('[data-image]').click()`);
    let imageState;
    for (let attempt = 0; attempt < 20; attempt++) {
      imageState = await evaluate(client, `(() => { const image = document.querySelector('.highlight-image-wrap img'); return image && { complete:image.complete, naturalWidth:image.naturalWidth, alt:image.alt, highlights:document.querySelectorAll('.image-highlight').length, inputs:document.querySelectorAll('#modal-root input, #modal-root textarea').length }; })()`);
      if (imageState?.complete && imageState.naturalWidth > 0) break;
      await delay(100);
    }
    if (!imageState?.complete || imageState.naturalWidth < 1 || imageState.alt !== 'ภาพกรณีศึกษา.png' || imageState.highlights !== 1 || imageState.inputs !== 0) throw new Error(`Case image/highlight editor failed: ${JSON.stringify(imageState)}`);
    await evaluate(client, `document.querySelector('[data-close]').click()`);
  }

  for (let printAttempt = 0; printAttempt < 2; printAttempt++) {
    await evaluate(client, `document.getElementById('quick-print').click()`);
    let printState;
    for (let attempt = 0; attempt < 40; attempt++) {
      printState = await evaluate(client, `({ hash:location.hash, title:document.title, heading:document.querySelector('.print-report h1')?.textContent, reportText:document.querySelector('.print-report')?.innerText, hasNarrative:Boolean([...document.querySelectorAll('.print-report h2')].find(item => item.textContent.includes('narrative'))), hasPrintButton:Boolean(document.querySelector('#print-now')), hasBackButton:Boolean(document.querySelector('#back-from-print')) })`);
      if (printState.hash === '#/print' && printState.heading) break;
      await delay(100);
    }
    if (printState.hash !== '#/print' || printState.title !== 'VibePBL Desktop' || printState.heading !== samples.title || !printState.reportText.includes('หายใจลำบาก') || printState.hasNarrative || !printState.hasPrintButton || !printState.hasBackButton) throw new Error(`Print preview failed: ${JSON.stringify(printState)}`);
    await evaluate(client, `history.back()`);
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate(client, `location.hash !== '#/print' && Boolean(document.getElementById('quick-print'))`)) break;
      await delay(100);
    }
  }

  await evaluate(client, `location.hash = '#/settings'`);
  await delay(180);
  await evaluate(client, `document.getElementById('reset-session').click()`);
  const resetDialog = await evaluate(client, `({ title:document.querySelector('.modal-header strong')?.textContent, inputs:document.querySelectorAll('#modal-root input').length, confirm:document.querySelector('[data-confirm]')?.textContent })`);
  if (resetDialog.title !== 'Delete this session?' || resetDialog.inputs !== 0 || !resetDialog.confirm?.includes('Delete session')) throw new Error(`Reset confirmation is incorrect: ${JSON.stringify(resetDialog)}`);
  await evaluate(client, `document.querySelector('[data-confirm]').click()`);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate(client, `!document.querySelector('.modal-backdrop')`)) break;
    await delay(100);
  }
  const resetSession = await evaluate(client, invokeExpression('get_session'));
  if (resetSession.title !== 'PBL Session' || resetSession.caseImages.length || resetSession.terms.length || resetSession.timeline.length || resetSession.problems.length || resetSession.objectives.length || Object.keys(resetSession.presenterAssignments).length) throw new Error(`Reset did not clear the working session: ${JSON.stringify(resetSession)}`);
  const sentinelDeleted = await access(resetSentinel).then(() => false, () => true);
  if (!sentinelDeleted) throw new Error('Reset left a private image copy in app storage.');
  const membersAfterReset = await evaluate(client, invokeExpression('get_members'));
  if (!membersAfterReset.some(member => member.id === testMember.id)) throw new Error('Reset removed the persistent member roster.');

  await evaluate(client, invokeExpression('remove_member', { id:testMember.id }));
  const membersAfterRemove = await evaluate(client, invokeExpression('get_members'));
  if (membersAfterRemove.length) throw new Error('Roster cleanup failed in the isolated test database.');

  const result = { page:{ title:page.title, url:page.url }, bridge:bridge.result.value, session:{ id:saved.id, title:saved.title }, routes:Object.keys(routeResults), nativeErrors:client.errors };
  if (!result.bridge.hasTauri || !result.bridge.hasInvoke || result.session.id !== 1 || client.errors.length) throw new Error(`Native bridge check failed: ${JSON.stringify(result)}`);
  console.log(`Native release checks OK: ${JSON.stringify(result)}`);
} finally {
  client?.close();
  app.kill();
  await delay(350);
  await rm(dataDirectory, { recursive:true, force:true }).catch(() => {});
}

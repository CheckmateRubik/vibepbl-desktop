import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';

const executable = resolve(process.argv[2] || 'src-tauri/target/release/vibepbl-desktop.exe');
const smokeImage = process.env.VIBEPBL_SMOKE_IMAGE;
const testRoot = process.platform === 'win32' && process.env.APPDATA ? join(process.env.APPDATA, 'app.vibepbl.desktop', 'vibepbl') : tmpdir();
await mkdir(testRoot, { recursive:true });
const dataDirectory = await mkdtemp(join(testRoot, 'native-check-'));
if (!resolve(dataDirectory).startsWith(`${resolve(testRoot)}${sep}`) || !basename(dataDirectory).startsWith('native-check-')) throw new Error('Refusing to use an unsafe native-test directory.');
const resetSentinel = join(dataDirectory, 'images', 'reset-check.png');
const browserFixturePath = join(dataDirectory, 'images', 'browser-fixture.png');
await mkdir(join(dataDirectory, 'images'), { recursive:true });
await writeFile(resetSentinel, 'private image copy');
await writeFile(browserFixturePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const port = 9333;
const app = spawn(executable, [], {
  env: {
    ...process.env,
    VIBEPBL_DATA_DIR: dataDirectory,
    WEBVIEW2_USER_DATA_FOLDER: join(dataDirectory, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (app.exitCode !== null) {
      const stderr = await new Promise(resolveText => {
        let output = '';
        app.stderr?.on('data', chunk => { output += chunk; });
        app.stderr?.on('end', () => resolveText(output));
        setTimeout(() => resolveText(output), 100);
      });
      throw new Error(`The native app exited before exposing its WebView (code ${app.exitCode})${stderr ? `: ${stderr}` : '.'}`);
    }
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
    case_images: [{ id:'image-check', filename:'image-check.png', originalName:'ภาพกรณีศึกษา.png', localPath:smokeImage || browserFixturePath, highlights:[{ id:'highlight-check', x:18, y:22, width:34, height:12 }] }],
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

  await evaluate(client, `location.hash = '#/settings'`);
  await delay(100);
  await client.send('Page.reload');
  await delay(800);
  const shellState = await evaluate(client, `(async () => { await document.fonts.ready; const logo=document.querySelector('.brand-logo'); const text=document.body.innerText; const css=[...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join(' '); return { fontFamily:getComputedStyle(document.body).fontFamily, thaiUiLoaded:document.fonts.check('16px "VibePBL Retro"','ภาษาไทย'), hasThaiUnicodeRange:css.toUpperCase().includes('U+E00-E7F'), logoSrc:logo?.getAttribute('src'), logoLoaded:Boolean(logo?.complete && logo.naturalWidth > 0), removedWorkspaceCopy:!text.includes('Private workspace') && !text.includes('Saved locally on this device'), removedJsonUi:!text.includes('.pbl.json'), savedStatusRemoved:!document.querySelector('.save-indicator,#save-indicator'), currentSection:document.getElementById('current-section')?.textContent, hasCustomScrollbar:css.includes('::-webkit-scrollbar-thumb') && css.includes('::-webkit-scrollbar-button') }; })()`);
  if (!shellState.fontFamily.includes('VibePBL Retro') || !shellState.thaiUiLoaded || !shellState.hasThaiUnicodeRange || shellState.logoSrc !== './assets/app-icon.svg' || !shellState.logoLoaded || !shellState.removedWorkspaceCopy || !shellState.removedJsonUi || !shellState.savedStatusRemoved || shellState.currentSection !== 'Session & settings' || !shellState.hasCustomScrollbar) throw new Error(`App shell simplification failed: ${JSON.stringify(shellState)}`);
  const frameState = await evaluate(client, `(() => { const root=document.documentElement; const titlebar=document.getElementById('window-titlebar'); const app=document.getElementById('app'); const rules=[...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } }); const cssTexts=rules.map(rule => rule.cssText); const css=cssTexts.join(' '); root.dataset.theme='default'; const modern={ height:titlebar.getBoundingClientRect().height, background:getComputedStyle(titlebar).backgroundColor, controlWidth:document.getElementById('window-minimize').getBoundingClientRect().width }; root.dataset.theme='retro'; const retro={ height:titlebar.getBoundingClientRect().height, backgroundImage:getComputedStyle(titlebar).backgroundImage, controlWidth:document.getElementById('window-minimize').getBoundingClientRect().width, bodyFont:getComputedStyle(document.body).fontFamily }; return { controls:document.querySelectorAll('.window-control').length, appAndFrameHeight:app.getBoundingClientRect().height + titlebar.getBoundingClientRect().height, viewportHeight:innerHeight, modern, retro, opaqueTrack:cssTexts.some(text => text.includes('::-webkit-scrollbar-track') && text.includes('--bg-app') && !text.includes('transparent')), retroArrows:css.includes('data:image/svg+xml') && css.includes('scrollbar-button:single-button:vertical:decrement') && css.includes('scrollbar-color: auto'), windowMethods:['minimize','toggleMaximize','close'].every(method => typeof window.__TAURI__.window.getCurrentWindow()[method] === 'function') }; })()`);
  if (frameState.controls !== 3 || !frameState.windowMethods || Math.abs(frameState.appAndFrameHeight - frameState.viewportHeight) > 1 || frameState.modern.height !== 30 || frameState.modern.controlWidth !== 40 || frameState.retro.height !== 26 || frameState.retro.controlWidth !== 22 || !frameState.retro.backgroundImage.includes('linear-gradient') || !frameState.retro.bodyFont.includes('VibePBL Retro') || !frameState.opaqueTrack || !frameState.retroArrows) throw new Error(`Custom title bar or scrollbar styling failed: ${JSON.stringify(frameState)}`);
  const windowState = await evaluate(client, `(async () => ({ hasWindowApi:Boolean(window.__TAURI__.window?.getCurrentWindow), maximized:await window.__TAURI__.window.getCurrentWindow().isMaximized() }))()`);
  if (!windowState.hasWindowApi || !windowState.maximized) throw new Error(`Desktop window did not open maximized: ${JSON.stringify(windowState)}`);
  const navigationCopy = await evaluate(client, `document.querySelector('.sidebar').innerText`);
  if (!navigationCopy.includes('ANALYZE') || !navigationCopy.includes('SYNTHESIZE') || navigationCopy.includes('ANALYSE') || navigationCopy.includes('SYNTHESISE')) throw new Error(`Navigation is not using US English: ${navigationCopy}`);
  const expectedRoutes = {
    case:'Case materials', terms:'Terminology clarifier', timeline:'Clinical timeline', problems:'Problems & hypotheses',
    objectives:'Learning objectives', randomizer:'Presenter randomizer', verification:'Hypotheses verification', settings:'Session & settings'
  };
  const routeResults = {};
  for (const [route, expectedHeading] of Object.entries(expectedRoutes)) {
    await evaluate(client, `location.hash = '#/${route}'`);
    await delay(180);
    routeResults[route] = await evaluate(client, `({ heading:document.querySelector('#page h2')?.textContent, text:document.querySelector('#page')?.innerText, controlValues:[...document.querySelectorAll('#page input,#page textarea,#page select')].map(control => control.value).join(' ') })`);
    if (routeResults[route].heading !== expectedHeading) throw new Error(`Route ${route} rendered ${routeResults[route].heading} instead of ${expectedHeading}.`);
  }
  if (routeResults.case.text.includes('Clinical narrative') || await evaluate(client, `Boolean(document.querySelector('#case-editor,.toolbar,.pin,.pin-index'))`)) throw new Error('Removed narrative or pin controls are still present.');
  if (!`${routeResults.terms.text} ${routeResults.terms.controlValues}`.includes('หายใจลำบาก') || !`${routeResults.timeline.text} ${routeResults.timeline.controlValues}`.includes('อาการแย่ลง')) throw new Error('Thai Act 1 data did not render.');
  if (!routeResults.problems.text.includes('Wrong') || !routeResults.verification.text.includes('Wrong')) throw new Error('Act 1/Act 2 hypothesis status was not synchronized.');
  if (!routeResults.randomizer.text.includes(testMemberName) || !routeResults.objectives.text.includes('เปรียบเทียบสาเหตุของอาการหายใจลำบาก')) throw new Error('Thai Act 2 assignment or objective mapping did not render.');

  await evaluate(client, `location.hash = '#/terms'`);
  await delay(180);
  const termEntry = await evaluate(client, `(() => { const input=document.getElementById('term-input'); input.value='หัวใจเต้นเร็ว'; input.dispatchEvent(new KeyboardEvent('keydown',{ key:'Enter', bubbles:true })); return { modal:Boolean(document.querySelector('.modal-backdrop')) }; })()`);
  await delay(120);
  if (termEntry.modal || !await evaluate(client, `document.querySelectorAll('[data-term-name]').length === 2`)) throw new Error('Term entry did not add inline with Enter.');

  await evaluate(client, `location.hash = '#/timeline'`);
  await delay(180);
  const timelineEntry = await evaluate(client, `(() => { document.getElementById('add-event').click(); const cards=[...document.querySelectorAll('[data-event-card]')]; const card=cards.at(-1); const textarea=card?.querySelector('[data-event-content]'); if (textarea) { textarea.value='ผลตรวจเลือดใหม่'; textarea.dispatchEvent(new Event('input',{ bubbles:true })); } card?.querySelector('[data-color="amber"]')?.click(); return { cards:cards.length, modal:Boolean(document.querySelector('.modal-backdrop')), hasConnector:Boolean(document.querySelector('[data-event-duration]')) }; })()`);
  await delay(120);
  if (timelineEntry.cards !== 2 || timelineEntry.modal || !timelineEntry.hasConnector) throw new Error(`Timeline did not use direct cards: ${JSON.stringify(timelineEntry)}`);

  await evaluate(client, `location.hash = '#/problems'`);
  await delay(180);
  const problemEntry = await evaluate(client, `(() => { const enter=(input,value) => { input.value=value; input.dispatchEvent(new KeyboardEvent('keydown',{ key:'Enter', bubbles:true })); }; enter(document.getElementById('problem-input'),'ไข้สูง'); enter(document.getElementById('hypothesis-input'),'ภาวะติดเชื้อ'); enter(document.getElementById('problem-input'),'อ่อนเพลีย'); enter(document.getElementById('hypothesis-input'),'ภาวะโลหิตจาง'); return { modal:Boolean(document.querySelector('.modal-backdrop')), problems:document.querySelectorAll('[data-problem]').length, hypotheses:document.querySelectorAll('[data-cycle]').length }; })()`);
  await delay(120);
  if (problemEntry.modal || problemEntry.problems !== 3 || problemEntry.hypotheses !== 1) throw new Error(`Problem or hypothesis Enter-to-add failed: ${JSON.stringify(problemEntry)}`);

  await evaluate(client, `location.hash = '#/objectives'`);
  await delay(180);
  const objectiveEntry = await evaluate(client, `(() => { const input=document.getElementById('objective-input'); input.value='วิเคราะห์แนวทางรักษา'; input.dispatchEvent(new KeyboardEvent('keydown',{ key:'Enter', bubbles:true })); let cards=[...document.querySelectorAll('.objective-card')]; [...cards[0].querySelectorAll('[data-link-lo]')].find(check => !check.checked && !check.disabled)?.click(); cards=[...document.querySelectorAll('.objective-card')]; [...cards.at(-1).querySelectorAll('[data-link-lo]')].find(check => !check.checked && !check.disabled)?.click(); cards=[...document.querySelectorAll('.objective-card')]; return { objectives:cards.length, checkboxes:document.querySelectorAll('[data-link-lo][type="checkbox"]').length, firstLinked:cards[0].querySelectorAll('[data-link-lo]:checked').length, secondLinked:cards.at(-1).querySelectorAll('[data-link-lo]:checked').length, unavailableInSecond:cards.at(-1).querySelectorAll('[data-link-lo]:disabled').length }; })()`);
  await delay(800);
  const inlineSession = await evaluate(client, invokeExpression('get_session'));
  const linkedProblems = inlineSession.objectives.flatMap(objective => objective.linkedProblemIds);
  if (objectiveEntry.objectives !== 2 || objectiveEntry.checkboxes !== 6 || objectiveEntry.firstLinked !== 2 || objectiveEntry.secondLinked !== 1 || objectiveEntry.unavailableInSecond !== 2 || Math.max(...inlineSession.objectives.map(objective => objective.linkedProblemIds.length)) < 2 || new Set(linkedProblems).size !== linkedProblems.length) throw new Error(`Many-to-one problem/objective mapping failed: ${JSON.stringify(objectiveEntry)}`);

  await evaluate(client, `location.hash = '#/problems'`);
  await delay(180);
  const autofillState = await evaluate(client, `({ controls:[...document.querySelectorAll('input,textarea,select')].every(control => control.autocomplete === 'off') })`);
  if (!autofillState.controls) throw new Error(`A workspace control still allows saved-info autofill: ${JSON.stringify(autofillState)}`);
  await evaluate(client, `document.querySelector('[data-edit-problem]').click()`);
  await delay(50);
  const modalAutofillState = await evaluate(client, `({ form:document.querySelector('#modal-form')?.autocomplete, controls:[...document.querySelectorAll('#modal-root input,#modal-root textarea,#modal-root select')].every(control => control.autocomplete === 'off') })`);
  if (modalAutofillState.form !== 'off' || !modalAutofillState.controls) throw new Error(`A modal control still allows saved-info autofill: ${JSON.stringify(modalAutofillState)}`);
  await evaluate(client, `document.querySelector('[data-cancel]').click()`);

  const retroState = await evaluate(client, `(() => { window.scrollTo(0,700); const bodyStyle=getComputedStyle(document.body); const mainStyle=getComputedStyle(document.querySelector('.main-shell')); return { theme:document.documentElement.dataset.theme, shell:getComputedStyle(document.querySelector('.app-shell')).display, sidebar:getComputedStyle(document.querySelector('.sidebar')).position, bodyPosition:bodyStyle.position, bodyOverflow:bodyStyle.overflow, mainOverflowY:mainStyle.overflowY, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollY:window.scrollY }; })()`);
  if (retroState.theme !== 'retro' || retroState.shell !== 'grid' || retroState.sidebar !== 'sticky' || retroState.bodyPosition !== 'fixed' || retroState.bodyOverflow !== 'hidden' || retroState.mainOverflowY !== 'auto' || retroState.overflow || retroState.scrollY !== 0) throw new Error(`Retro theme changed the app structure or the outer window can move: ${JSON.stringify(retroState)}`);

  const retroChrome = await evaluate(client, `(() => { const browserbar=document.querySelector('.retro-browserbar'); const controls=[...document.querySelectorAll('button,input,textarea,select,.card,.topbar-section')]; return { visible:getComputedStyle(browserbar).display === 'block', menu:browserbar.querySelector('.retro-menubar')?.innerText, address:browserbar.querySelector('#retro-address-text')?.textContent, rounded:controls.filter(control => getComputedStyle(control).borderRadius !== '0px').length }; })()`);
  if (!retroChrome.visible || !retroChrome.menu.includes('File') || !retroChrome.menu.includes('Favorites') || !retroChrome.address.startsWith('vibepbl://session/') || retroChrome.rounded !== 0) throw new Error(`Retro browser chrome failed: ${JSON.stringify(retroChrome)}`);

  const retroNavigation = await evaluate(client, `(() => { const forward=document.querySelector('[data-browser-forward]'); const back=document.querySelector('[data-browser-back]'); const route=() => location.hash.replace('#/',''); location.hash='#/case'; forward.click(); const forwardFromCase=route(); location.hash='#/objectives'; forward.click(); const forwardWrap=route(); location.hash='#/case'; back.click(); const backWrap=route(); back.click(); const backFromObjectives=route(); return { forwardFromCase, forwardWrap, backWrap, backFromObjectives }; })()`);
  if (retroNavigation.forwardFromCase !== 'terms' || retroNavigation.forwardWrap !== 'case' || retroNavigation.backWrap !== 'objectives' || retroNavigation.backFromObjectives !== 'problems') throw new Error(`Retro Act 1 navigation failed: ${JSON.stringify(retroNavigation)}`);

  const sidebarState = await evaluate(client, `(() => { const button=document.querySelector('.retro-browserbar [data-sidebar-toggle]'); button.click(); const closed={ collapsed:document.getElementById('app').classList.contains('sidebar-collapsed'), label:button.getAttribute('aria-label') }; button.click(); return { ...closed, reopened:!document.getElementById('app').classList.contains('sidebar-collapsed'), reopenedLabel:button.getAttribute('aria-label') }; })()`);
  if (!sidebarState.collapsed || sidebarState.label !== 'Open sidebar' || !sidebarState.reopened || sidebarState.reopenedLabel !== 'Close sidebar') throw new Error(`Desktop sidebar toggle failed: ${JSON.stringify(sidebarState)}`);

  await client.send('Emulation.setDeviceMetricsOverride', { width:1000, height:720, deviceScaleFactor:1, mobile:false });
  await delay(300);
  const narrowState = await evaluate(client, `(() => { window.scrollTo({ left:700, top:window.scrollY }); const main=document.querySelector('.main-shell').getBoundingClientRect(); return { shell:getComputedStyle(document.querySelector('.app-shell')).display, sidebar:getComputedStyle(document.querySelector('.sidebar')).position, mainWidth:main.width, menu:getComputedStyle(document.querySelector('#sidebar-toggle')).display, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollX:window.scrollX }; })()`);
  if (narrowState.shell !== 'block' || narrowState.sidebar !== 'fixed' || narrowState.mainWidth < 900 || narrowState.menu === 'none' || narrowState.overflow || narrowState.scrollX !== 0) throw new Error(`Narrow workspace can move or collapse: ${JSON.stringify(narrowState)}`);
  await client.send('Emulation.clearDeviceMetricsOverride');

  {
    await evaluate(client, `location.hash = '#/case'`);
    await delay(180);
    await evaluate(client, `document.querySelector('[data-image]').click()`);
    let imageState;
    for (let attempt = 0; attempt < 20; attempt++) {
      imageState = await evaluate(client, `(() => { const image = document.querySelector('.highlight-image-wrap img'); return image && { complete:image.complete, naturalWidth:image.naturalWidth, renderedWidth:image.getBoundingClientRect().width, alt:image.alt, highlights:document.querySelectorAll('.image-highlight').length, inputs:document.querySelectorAll('#modal-root input, #modal-root textarea').length, zoomControls:document.querySelectorAll('.image-zoom-toolbar button').length }; })()`);
      if (imageState?.complete && imageState.naturalWidth > 0) break;
      await delay(100);
    }
    if (!imageState?.complete || imageState.naturalWidth < 1 || imageState.alt !== 'ภาพกรณีศึกษา.png' || imageState.highlights !== 1 || imageState.inputs !== 0 || imageState.zoomControls !== 3) throw new Error(`Case image/highlight editor failed: ${JSON.stringify(imageState)}`);
    const zoomState = await evaluate(client, `(() => { const before=document.querySelector('#highlight-image').getBoundingClientRect().width; document.querySelector('#zoom-in').click(); const after=document.querySelector('#highlight-image').getBoundingClientRect().width; return { before, after, readout:document.querySelector('#zoom-readout').textContent, highlights:document.querySelectorAll('.image-highlight').length }; })()`);
    if (zoomState.after <= zoomState.before || zoomState.readout !== '125%' || zoomState.highlights !== 1) throw new Error(`Case image zoom failed: ${JSON.stringify(zoomState)}`);
    await evaluate(client, `document.querySelector('[data-close]').click()`);
  }

  for (let printAttempt = 0; printAttempt < 2; printAttempt++) {
    await evaluate(client, `document.querySelector('[data-quick-print]').click()`);
    let printState;
    for (let attempt = 0; attempt < 40; attempt++) {
      printState = await evaluate(client, `({ hash:location.hash, title:document.title, heading:document.querySelector('.print-report h1')?.textContent, reportText:document.querySelector('.print-report')?.innerText, fontFamily:getComputedStyle(document.querySelector('.print-report')).fontFamily, fontLoaded:document.fonts.check('16px Sarabun'), hasNarrative:Boolean([...document.querySelectorAll('.print-report h2')].find(item => item.textContent.includes('narrative'))), hasPrintButton:Boolean(document.querySelector('#print-now')), hasBackButton:Boolean(document.querySelector('#back-from-print')) })`);
      if (printState.hash === '#/print' && printState.heading && printState.fontLoaded) break;
      await delay(100);
    }
    if (printState.hash !== '#/print' || printState.title !== 'VibePBL Desktop' || printState.heading !== samples.title || !printState.reportText.includes('หายใจลำบาก') || !printState.fontFamily.includes('Sarabun') || !printState.fontLoaded || printState.hasNarrative || !printState.hasPrintButton || !printState.hasBackButton) throw new Error(`Print preview failed: ${JSON.stringify(printState)}`);
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

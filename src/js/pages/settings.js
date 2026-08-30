import { esc, pageHeader } from '../components/helpers.js';
import { openConfirmModal } from '../components/modal.js';

const themes = [
  ['default','Clinical Light',['#10172c','#3672f4','#f6f8fc']], ['dark','Dark Mode',['#080d17','#6ea0ff','#151d2d']],
  ['midnight','Midnight & Gold',['#102a43','#a87316','#f1f5fa']], ['medical','Medical Minimal',['#263a3d','#287e82','#f3f7f7']],
  ['sepia','Warm Sepia',['#47372c','#9b5e35','#f5efe4']], ['contrast','High Contrast',['#000','#0047cc','#fff']],
  ['retro','Retro Web 1.0',['#000066','#0000aa','#c0c0c0']]
];

export function renderSettings(ctx) {
  document.getElementById('page').innerHTML = `
    ${pageHeader('Session & settings', 'Set the session title and appearance.')}
    <div class="settings-grid">
      <section class="card"><h3 class="section-title">Session</h3><div class="field"><label for="settings-title">Session title</label><input id="settings-title" class="input" value="${esc(ctx.session.title)}"></div></section>
      <section class="card"><h3 class="section-title">Appearance</h3><div class="theme-grid">${themes.map(([id,name,colors]) => `<button class="theme-option ${ctx.session.theme === id ? 'active' : ''}" data-theme-id="${id}"><span class="theme-swatch">${colors.map(color => `<i style="background:${color}"></i>`).join('')}</span><strong>${name}</strong></button>`).join('')}</div></section>
      <section class="card danger-zone"><h3 class="section-title">Start over</h3><p class="muted">Clear the current working session and imported case images.</p><button id="reset-session" class="button button-danger">Reset session</button></section>
    </div>`;
  document.getElementById('settings-title').addEventListener('input', event => ctx.setField('title', event.target.value, false));
  document.querySelectorAll('[data-theme-id]').forEach(button => button.addEventListener('click', () => { ctx.setField('theme', button.dataset.themeId); ctx.render(); }));
  document.getElementById('reset-session').addEventListener('click', () => openConfirmModal(
    'Delete this session?',
    'This clears the working session, including its text, imported images, and highlights.',
    async () => { await ctx.API.resetSession(); ctx.setSession(await ctx.API.getSession()); ctx.showToast('Working session reset', 'success'); },
    'Delete session'
  ));
}

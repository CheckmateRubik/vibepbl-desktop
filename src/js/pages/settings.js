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
    ${pageHeader('Session & settings', 'Manage the reusable group roster, appearance, and portable session file.')}
    <div class="settings-grid">
      <section class="card"><h3 class="section-title">Session</h3><div class="field"><label for="settings-title">Session title</label><input id="settings-title" class="input" value="${esc(ctx.session.title)}"></div><div class="d-flex gap-2 mt-3"><button id="export-session" class="button button-primary">Save .pbl.json</button><button id="import-session" class="button button-secondary">Open .pbl.json</button></div><p class="small muted">Portable files include the full session and embedded copies of imported images.</p></section>
      <section class="card"><h3 class="section-title">Appearance</h3><div class="theme-grid">${themes.map(([id,name,colors]) => `<button class="theme-option ${ctx.session.theme === id ? 'active' : ''}" data-theme-id="${id}"><span class="theme-swatch">${colors.map(color => `<i style="background:${color}"></i>`).join('')}</span><strong>${name}</strong></button>`).join('')}</div></section>
      <section class="card"><h3 class="section-title">Group members</h3><div class="form-row"><input id="member-name" class="input" placeholder="Student or tutor name"><button id="add-member" class="button button-primary">Add</button></div><div class="roster-list mt-3">${ctx.members.length ? ctx.members.map(member => `<span class="member-chip">${esc(member.name)}<button class="button button-ghost button-sm" data-remove-member="${member.id}">✕</button></span>`).join('') : '<span class="muted">The persistent roster is empty.</span>'}</div><details class="mt-3"><summary>Paste a list of names</summary><textarea id="member-list" class="textarea" placeholder="One name per line"></textarea><button id="import-members" class="button button-secondary button-sm">Import names</button></details></section>
      <section class="card danger-zone"><h3 class="section-title">Start over</h3><p class="muted">Clear the working session while keeping the persistent member roster.</p><button id="reset-session" class="button button-danger">Reset session</button></section>
    </div>`;
  document.getElementById('settings-title').addEventListener('input', event => ctx.setField('title', event.target.value, false));
  document.querySelectorAll('[data-theme-id]').forEach(button => button.addEventListener('click', () => { ctx.setField('theme', button.dataset.themeId); ctx.render(); }));
  const addMember = async () => { const input = document.getElementById('member-name'); if (!input.value.trim()) return; try { await ctx.API.addMember(input.value.trim()); await ctx.refreshMembers(); } catch (error) { ctx.showToast(String(error), 'error'); } };
  document.getElementById('add-member').addEventListener('click', addMember);
  document.getElementById('member-name').addEventListener('keydown', event => { if (event.key === 'Enter') addMember(); });
  document.querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', async () => { await ctx.API.removeMember(Number(button.dataset.removeMember)); await ctx.refreshMembers(); }));
  document.getElementById('import-members').addEventListener('click', async () => { const names = document.getElementById('member-list').value.split(/\r?\n|,/).map(name => name.trim()).filter(Boolean); if (!names.length) return; await ctx.API.importMembers(names); await ctx.refreshMembers(); });
  document.getElementById('export-session').addEventListener('click', async () => { try { const path = await ctx.API.exportSavefile(); ctx.showToast(`Session saved to ${path}`, 'success'); } catch (error) { if (!String(error).includes('cancelled')) ctx.showToast(String(error), 'error'); } });
  document.getElementById('import-session').addEventListener('click', async () => { try { const next = await ctx.API.importSavefile(); ctx.setSession(next); ctx.showToast('Session opened', 'success'); } catch (error) { if (!String(error).includes('cancelled')) ctx.showToast(String(error), 'error'); } });
  document.getElementById('reset-session').addEventListener('click', () => openConfirmModal(
    'Delete this session?',
    'This clears the working session and keeps your saved group roster.',
    async () => { await ctx.API.resetSession(); ctx.setSession(await ctx.API.getSession()); ctx.showToast('Working session reset', 'success'); },
    'Delete session'
  ));
}

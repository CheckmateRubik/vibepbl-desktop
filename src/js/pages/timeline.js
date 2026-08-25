import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';
import { openFormModal } from '../components/modal.js';

const colors = {
  slate: { name:'Slate', bg:'#f1f5f9', text:'#334155', border:'#94a3b8' }, coral: { name:'Coral', bg:'#fff1f2', text:'#9f1239', border:'#fb7185' },
  amber: { name:'Amber', bg:'#fffbeb', text:'#92400e', border:'#f59e0b' }, emerald: { name:'Emerald', bg:'#ecfdf5', text:'#065f46', border:'#10b981' }, lavender: { name:'Lavender', bg:'#f5f3ff', text:'#5b21b6', border:'#a78bfa' }
};
let draggingId;

export function renderTimeline(ctx) {
  const locked = ctx.session.isAct1Completed;
  document.getElementById('page').innerHTML = `
    ${pageHeader('Clinical timeline', 'Arrange symptoms, investigations, and changes in chronological order.', `<button id="add-event" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add event</button>`)}
    ${locked ? '<div class="lock-banner">🔒 <strong>Act 1 is locked</strong></div>' : ''}
    <section class="card"><div class="timeline-list">${ctx.session.timeline.length ? ctx.session.timeline.map(event => `<article class="timeline-card" draggable="${!locked}" data-event="${event.id}" style="background:${event.colorTheme.bg};color:${event.colorTheme.text};border-color:${event.colorTheme.border}"><div><span class="drag-handle">⠿</span> <span class="timeline-duration">${esc(event.durationText)}</span></div><div>${esc(event.content)}</div><div class="item-actions"><button class="button button-ghost" data-edit="${event.id}" ${locked ? 'disabled' : ''}>✎</button><button class="button button-ghost" data-delete="${event.id}" ${locked ? 'disabled' : ''}>🗑</button></div></article>`).join('') : emptyState('↝', 'No timeline events yet', 'Start with onset, then add important changes through the current state.')}</div></section>`;
  document.getElementById('add-event').addEventListener('click', () => editEvent(ctx));
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editEvent(ctx, button.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => { ctx.setField('timeline', ctx.session.timeline.filter(event => event.id !== button.dataset.delete)); ctx.render(); }));
  document.querySelectorAll('[data-event]').forEach(card => {
    card.addEventListener('dragstart', () => draggingId = card.dataset.event);
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => { event.preventDefault(); const target = card.dataset.event; if (!draggingId || draggingId === target) return; const next = [...ctx.session.timeline]; const from = next.findIndex(item => item.id === draggingId); const to = next.findIndex(item => item.id === target); next.splice(to, 0, next.splice(from, 1)[0]); ctx.setField('timeline', next); ctx.render(); });
  });
}

function editEvent(ctx, id) {
  const current = ctx.session.timeline.find(event => event.id === id);
  openFormModal(current ? 'Edit clinical event' : 'Add clinical event', [
    { name:'durationText', label:'Duration or time label', value:esc(current?.durationText || '') },
    { name:'content', label:'Clinical event', type:'textarea', value:esc(current?.content || '') },
    { name:'color', label:'Card color', type:'select', value:current?.colorTheme?.name?.toLowerCase() || 'slate', options:Object.keys(colors).map(value => ({ value, label:colors[value].name })) }
  ], ({ durationText, content, color }) => {
    const item = { id: current?.id || uid('time'), durationText: durationText.trim(), content: content.trim(), colorTheme: colors[color] || colors.slate };
    ctx.setField('timeline', current ? ctx.session.timeline.map(event => event.id === id ? item : event) : [...ctx.session.timeline, item]); ctx.render();
  });
}

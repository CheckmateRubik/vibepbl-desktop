import { esc, emptyState, pageHeader, uid } from '../components/helpers.js';

const colors = {
  slate: { name:'Slate', bg:'#f1f5f9', text:'#334155', border:'#94a3b8' },
  lavender: { name:'Lavender', bg:'#f5f3ff', text:'#5b21b6', border:'#a78bfa' },
  sky: { name:'Sky', bg:'#eff6ff', text:'#1d4ed8', border:'#93c5fd' },
  emerald: { name:'Emerald', bg:'#ecfdf5', text:'#065f46', border:'#6ee7b7' },
  amber: { name:'Amber', bg:'#fffbeb', text:'#92400e', border:'#fcd34d' },
  coral: { name:'Coral', bg:'#fff1f2', text:'#9f1239', border:'#fda4af' }
};

let draggingId;
let focusEventId;

export function renderTimeline(ctx) {
  const locked = ctx.session.isAct1Completed;
  const timeline = Array.isArray(ctx.session.timeline) ? ctx.session.timeline : [];
  document.getElementById('page').innerHTML = `
    ${pageHeader('Clinical timeline', 'Arrange symptoms, investigations, and changes in chronological order.', `<button id="add-event" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Add event</button>`)}
    ${locked ? '<div class="lock-banner">🔒 <strong>Act 1 is locked</strong></div>' : ''}
    <section class="card timeline-builder"><div class="timeline-list">${timeline.length ? timeline.map((item, index) => eventBlock(item, index, locked)).join('') : emptyState('↝', 'No timeline events yet', 'Add an event, then write directly in its card.')}</div></section>`;

  document.getElementById('add-event').addEventListener('click', () => addEvent(ctx));
  document.querySelectorAll('[data-event-content]').forEach(textarea => textarea.addEventListener('input', () => updateEvent(ctx, textarea.dataset.eventContent, { content:textarea.value }, false)));
  document.querySelectorAll('[data-event-duration]').forEach(input => input.addEventListener('input', () => updateEvent(ctx, input.dataset.eventDuration, { durationText:input.value }, false)));
  document.querySelectorAll('[data-event-color]').forEach(button => button.addEventListener('click', () => {
    updateEvent(ctx, button.dataset.eventColor, { colorTheme:colors[button.dataset.color] || colors.slate });
    ctx.render();
  }));
  document.querySelectorAll('[data-delete-event]').forEach(button => button.addEventListener('click', () => {
    if (!confirm('Delete this timeline event?')) return;
    ctx.setField('timeline', timeline.filter(item => item.id !== button.dataset.deleteEvent));
    ctx.render();
  }));
  document.querySelectorAll('[data-drag-event]').forEach(handle => handle.addEventListener('dragstart', () => draggingId = handle.dataset.dragEvent));
  document.querySelectorAll('[data-event-card]').forEach(card => {
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => {
      event.preventDefault();
      const target = card.dataset.eventCard;
      if (!draggingId || draggingId === target) return;
      const next = [...timeline];
      const from = next.findIndex(item => item.id === draggingId);
      const to = next.findIndex(item => item.id === target);
      if (from < 0 || to < 0) return;
      next.splice(to, 0, next.splice(from, 1)[0]);
      draggingId = undefined;
      ctx.setField('timeline', next);
      ctx.render();
    });
  });

  if (focusEventId) {
    document.querySelector(`[data-event-content="${CSS.escape(focusEventId)}"]`)?.focus();
    focusEventId = undefined;
  }
}

function eventBlock(item, index, locked) {
  const theme = eventTheme(item);
  const colorKey = Object.entries(colors).find(([, color]) => color.name === theme.name)?.[0] || 'slate';
  const connector = index ? `<div class="timeline-connector"><span></span><input class="timeline-step-input" data-event-duration="${esc(item.id)}" value="${esc(item.durationText || '')}" placeholder="Time or next step" aria-label="Time before event ${index + 1}" ${locked ? 'disabled' : ''}><b>↓</b></div>` : '';
  return `${connector}<article class="timeline-event-card" data-event-card="${esc(item.id)}" style="--event-bg:${safeColor(theme.bg, colors.slate.bg)};--event-text:${safeColor(theme.text, colors.slate.text)};--event-border:${safeColor(theme.border, colors.slate.border)}">
    <header class="timeline-event-head">
      <span class="timeline-event-badge" draggable="${!locked}" data-drag-event="${esc(item.id)}" title="Drag to reorder">EVENT ${index + 1}</span>
      <div class="timeline-event-actions">
        <div class="timeline-color-palette" aria-label="Event color">${Object.entries(colors).map(([key, color]) => `<button type="button" class="timeline-color-dot ${key === colorKey ? 'active' : ''}" data-event-color="${esc(item.id)}" data-color="${key}" style="--dot:${color.bg};--dot-border:${color.border}" title="${color.name}" aria-label="Use ${color.name}" ${locked ? 'disabled' : ''}></button>`).join('')}</div>
        <button class="button button-ghost" data-delete-event="${esc(item.id)}" aria-label="Delete event ${index + 1}" ${locked ? 'disabled' : ''}>🗑</button>
      </div>
    </header>
    <textarea class="timeline-event-text" data-event-content="${esc(item.id)}" placeholder="Write clinical progress details (for example symptoms, vitals, or findings)…" ${locked ? 'disabled' : ''}>${esc(item.content || '')}</textarea>
  </article>`;
}

function addEvent(ctx) {
  const item = { id:uid('time'), durationText:ctx.session.timeline.length ? 'Next step' : 'Initial presentation', content:'', colorTheme:colors.slate };
  focusEventId = item.id;
  ctx.setField('timeline', [...ctx.session.timeline, item]);
  ctx.render();
}

function updateEvent(ctx, id, changes, immediate = true) {
  const item = ctx.session.timeline.find(event => event.id === id);
  if (!item) return;
  Object.assign(item, changes);
  ctx.setField('timeline', ctx.session.timeline, immediate);
}

function eventTheme(item) {
  const theme = item?.colorTheme;
  return theme && typeof theme === 'object' ? { ...colors.slate, ...theme } : colors.slate;
}

function safeColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback; }

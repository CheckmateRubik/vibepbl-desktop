import { esc, pageHeader, sanitizeRichText } from '../components/helpers.js';
import { openModal } from '../components/modal.js';

export function renderCase(ctx) {
  const { session } = ctx;
  const locked = session.isAct1Completed;
  document.getElementById('page').innerHTML = `
    ${pageHeader('Case materials', 'Capture the clinical trigger, supporting documents, and image findings in one projector-ready workspace.', `<button id="add-image" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Import clinical image</button>`)}
    ${locked ? '<div class="lock-banner"><span>🔒</span><div><strong>Act 1 is locked</strong><div class="small">Unlock it from Learning objectives if the group needs to revise the case.</div></div></div>' : ''}
    <section class="card">
      <h3 class="section-title">Clinical narrative</h3>
      <div class="toolbar" aria-label="Text formatting"><button data-format="bold"><b>B</b></button><button data-format="italic"><i>I</i></button><button data-format="insertUnorderedList">• List</button><button data-format="removeFormat">Clear</button></div>
      <div id="case-editor" class="rich-editor" contenteditable="${!locked}" data-placeholder="Enter the case scenario…">${sanitizeRichText(session.caseText)}</div>
    </section>
    <section class="card">
      <h3 class="section-title">Clinical images <span class="muted small">(${session.caseImages.length})</span></h3>
      ${session.caseImages.length ? `<div class="image-grid">${session.caseImages.map(image => `
        <article class="image-card"><button class="image-open" data-image="${esc(image.id)}" aria-label="Annotate ${esc(image.originalName)}"><img src="${esc(ctx.API.imageUrl(image.localPath))}" alt="${esc(image.originalName)}"></button><div class="image-meta"><div class="list-item-main"><strong>${esc(image.originalName)}</strong><div class="pin-count">${image.pins.length} annotation${image.pins.length === 1 ? '' : 's'}</div></div><button class="button button-ghost" data-delete-image="${esc(image.id)}" ${locked ? 'disabled' : ''} aria-label="Delete">🗑</button></div></article>`).join('')}</div>` : '<div class="empty-state"><div class="empty-icon">▧</div><strong>No clinical images yet</strong><p>Import X-rays, scans, photographs, or exported DICOM frames from this computer.</p></div>'}
    </section>`;

  document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => { document.execCommand(button.dataset.format); document.getElementById('case-editor').focus(); }));
  const editor = document.getElementById('case-editor');
  editor?.addEventListener('input', () => ctx.setField('caseText', sanitizeRichText(editor.innerHTML), false));
  document.getElementById('add-image').addEventListener('click', async () => {
    try { const image = await ctx.API.pickImage(); session.caseImages.push(image); ctx.render(); ctx.showToast('Clinical image imported', 'success'); }
    catch (error) { if (!String(error).includes('cancelled')) ctx.showToast(String(error), 'error'); }
  });
  document.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => openAnnotation(ctx, button.dataset.image)));
  document.querySelectorAll('[data-delete-image]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this imported image and all its annotations?')) return;
    try { await ctx.API.deleteImage(button.dataset.deleteImage); session.caseImages = session.caseImages.filter(image => image.id !== button.dataset.deleteImage); ctx.render(); }
    catch (error) { ctx.showToast(String(error), 'error'); }
  }));
}

function openAnnotation(ctx, imageId) {
  const image = ctx.session.caseImages.find(item => item.id === imageId);
  const pins = () => image.pins.map((pin, index) => `<button class="pin" data-pin="${esc(pin.id)}" style="left:${pin.x}%;top:${pin.y}%" title="${esc(pin.label)}">${index + 1}</button>`).join('');
  const index = () => image.pins.map((pin, number) => `<div class="list-item"><span class="code-badge">${number + 1}</span><div class="list-item-main">${esc(pin.label)}<div class="small muted">${pin.x}%, ${pin.y}%</div></div>${ctx.session.isAct1Completed ? '' : `<button class="button button-ghost" data-remove-pin="${esc(pin.id)}">🗑</button>`}</div>`).join('');
  openModal(esc(image.originalName), `<div class="annotation-stage"><div class="annotation-image-wrap"><img id="annotation-image" src="${esc(ctx.API.imageUrl(image.localPath))}" alt="${esc(image.originalName)}"><div id="pin-layer">${pins()}</div></div></div><p class="small muted">${ctx.session.isAct1Completed ? 'Act 1 is locked.' : 'Click the image to add a numbered clinical finding.'}</p><div id="pin-index" class="pin-index">${index()}</div>`, root => {
    const stageImage = root.querySelector('#annotation-image');
    if (!ctx.session.isAct1Completed) stageImage.addEventListener('click', event => {
      const rect = stageImage.getBoundingClientRect();
      const label = prompt('Enter the clinical finding for this pin:');
      if (!label?.trim()) return;
      image.pins.push({ id: `pin-${Date.now()}`, x: Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(1)), y: Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(1)), label: label.trim() });
      ctx.setField('caseImages', ctx.session.caseImages);
      root.querySelector('#pin-layer').innerHTML = pins(); root.querySelector('#pin-index').innerHTML = index(); bindRemove();
    });
    const bindRemove = () => root.querySelectorAll('[data-remove-pin]').forEach(button => button.addEventListener('click', () => { image.pins = image.pins.filter(pin => pin.id !== button.dataset.removePin); ctx.setField('caseImages', ctx.session.caseImages); root.querySelector('#pin-layer').innerHTML = pins(); root.querySelector('#pin-index').innerHTML = index(); bindRemove(); }));
    bindRemove();
  });
}

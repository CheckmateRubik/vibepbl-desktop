import { esc, pageHeader } from '../components/helpers.js';
import { openModal } from '../components/modal.js';

const regionsFor = image => (image.highlights || image.pins || [])
  .filter(region => Number(region.width) > 0.5 && Number(region.height) > 0.5);

const regionMarkup = region => `<button class="image-highlight" data-highlight="${esc(region.id)}" style="left:${region.x}%;top:${region.y}%;width:${region.width}%;height:${region.height}%" aria-label="Remove highlight"></button>`;

export function renderCase(ctx) {
  const { session } = ctx;
  const locked = session.isAct1Completed;
  document.getElementById('page').innerHTML = `
    ${pageHeader('Case materials', 'Import the case image, then highlight the exact words or regions the group should focus on.', `<button id="add-image" class="button button-primary" ${locked ? 'disabled' : ''}>＋ Import image</button>`)}
    ${locked ? '<div class="lock-banner"><span>🔒</span><div><strong>Act 1 is locked</strong><div class="small">Unlock it from Learning objectives if the group needs to revise the case.</div></div></div>' : ''}
    <section class="card case-image-workspace">
      <div class="section-heading"><div><h3 class="section-title">Case images <span class="muted small">(${session.caseImages.length})</span></h3><p class="section-help">Open an image and drag across a word or area to highlight it.</p></div></div>
      ${session.caseImages.length ? `<div class="image-grid">${session.caseImages.map(image => {
        const count = regionsFor(image).length;
        return `<article class="image-card"><button class="image-open" data-image="${esc(image.id)}" aria-label="Highlight ${esc(image.originalName)}"><img src="${esc(ctx.API.imageUrl(image.localPath))}" alt="${esc(image.originalName)}"></button><div class="image-meta"><div class="list-item-main"><strong>${esc(image.originalName)}</strong><div class="highlight-count" data-highlight-count="${esc(image.id)}">${count} highlight${count === 1 ? '' : 's'}</div></div><button class="button button-ghost" data-delete-image="${esc(image.id)}" ${locked ? 'disabled' : ''} aria-label="Delete image">🗑</button></div></article>`;
      }).join('')}</div>` : '<div class="empty-state"><div class="empty-icon">▧</div><strong>No case images yet</strong><p>Import a scan, photograph, screenshot, or exported DICOM frame from this computer.</p></div>'}
    </section>`;

  document.getElementById('add-image').addEventListener('click', async () => {
    try { const image = await ctx.API.pickImage(); session.caseImages.push(image); ctx.render(); ctx.showToast('Case image imported', 'success'); }
    catch (error) { if (!String(error).includes('cancelled')) ctx.showToast(String(error), 'error'); }
  });
  document.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => openHighlightEditor(ctx, button.dataset.image)));
  document.querySelectorAll('[data-delete-image]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this imported image and its highlights?')) return;
    try { await ctx.API.deleteImage(button.dataset.deleteImage); session.caseImages = session.caseImages.filter(image => image.id !== button.dataset.deleteImage); ctx.render(); }
    catch (error) { ctx.showToast(String(error), 'error'); }
  }));
}

function openHighlightEditor(ctx, imageId) {
  const image = ctx.session.caseImages.find(item => item.id === imageId);
  image.highlights = regionsFor(image);
  delete image.pins;
  const locked = ctx.session.isAct1Completed;
  const renderRegions = root => {
    root.querySelector('#highlight-layer').innerHTML = image.highlights.map(regionMarkup).join('');
    root.querySelector('#highlight-total').textContent = `${image.highlights.length} highlight${image.highlights.length === 1 ? '' : 's'}`;
    const pageCount = document.querySelector(`[data-highlight-count="${CSS.escape(image.id)}"]`);
    if (pageCount) pageCount.textContent = `${image.highlights.length} highlight${image.highlights.length === 1 ? '' : 's'}`;
    if (!locked) root.querySelectorAll('[data-highlight]').forEach(region => region.addEventListener('click', event => {
      event.stopPropagation();
      image.highlights = image.highlights.filter(item => item.id !== region.dataset.highlight);
      ctx.setField('caseImages', ctx.session.caseImages);
      renderRegions(root);
    }));
  };

  openModal(esc(image.originalName), `
    <div class="image-zoom-toolbar" aria-label="Image zoom controls"><button id="zoom-out" class="button button-secondary button-sm" aria-label="Zoom out">−</button><strong id="zoom-readout">100%</strong><button id="zoom-in" class="button button-secondary button-sm" aria-label="Zoom in">＋</button><button id="zoom-fit" class="button button-secondary button-sm">Fit image</button></div>
    <div class="highlight-stage"><div id="highlight-image-wrap" class="highlight-image-wrap ${locked ? 'is-locked' : ''}"><img id="highlight-image" src="${esc(ctx.API.imageUrl(image.localPath))}" alt="${esc(image.originalName)}" draggable="false"><div id="highlight-layer"></div></div></div>
    <div class="highlight-footer"><p>${locked ? 'Act 1 is locked.' : 'Drag over a word or area to highlight it. Click a highlight to remove it.'}</p><div class="highlight-actions"><strong id="highlight-total"></strong>${locked ? '' : '<button id="clear-highlights" class="button button-secondary button-sm">Clear highlights</button>'}</div></div>`, root => {
    const wrap = root.querySelector('#highlight-image-wrap');
    const stage = root.querySelector('.highlight-stage');
    const stageImage = root.querySelector('#highlight-image');
    let zoom = 1;
    let fittedSize;
    const applyZoom = next => {
      if (!fittedSize) return;
      zoom = Math.max(.5, Math.min(3, next));
      stageImage.style.width = `${fittedSize.width * zoom}px`;
      stageImage.style.height = `${fittedSize.height * zoom}px`;
      stageImage.style.maxWidth = 'none';
      stageImage.style.maxHeight = 'none';
      root.querySelector('#zoom-readout').textContent = `${Math.round(zoom * 100)}%`;
      root.querySelector('#zoom-out').disabled = zoom <= .5;
      root.querySelector('#zoom-in').disabled = zoom >= 3;
    };
    const captureFittedSize = () => {
      if (fittedSize || !stageImage.naturalWidth) return;
      const scale = Math.min(1, Math.max(1, stage.clientWidth - 36) / stageImage.naturalWidth, Math.max(260, window.innerHeight * .65) / stageImage.naturalHeight);
      fittedSize = { width:stageImage.naturalWidth * scale, height:stageImage.naturalHeight * scale };
      applyZoom(zoom);
    };
    stageImage.addEventListener('load', captureFittedSize, { once:true });
    if (stageImage.complete) requestAnimationFrame(captureFittedSize);
    root.querySelector('#zoom-out').addEventListener('click', () => applyZoom(zoom - .25));
    root.querySelector('#zoom-in').addEventListener('click', () => applyZoom(zoom + .25));
    root.querySelector('#zoom-fit').addEventListener('click', () => applyZoom(1));
    renderRegions(root);
    if (locked) return;

    root.querySelector('#clear-highlights').addEventListener('click', () => {
      if (!image.highlights.length) return;
      image.highlights = [];
      ctx.setField('caseImages', ctx.session.caseImages);
      renderRegions(root);
    });

    let drag;
    const point = event => {
      const rect = stageImage.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
      };
    };
    const drawDraft = current => {
      const left = Math.min(drag.start.x, current.x);
      const top = Math.min(drag.start.y, current.y);
      const width = Math.abs(current.x - drag.start.x);
      const height = Math.abs(current.y - drag.start.y);
      Object.assign(drag.element.style, { left:`${left}%`, top:`${top}%`, width:`${width}%`, height:`${height}%` });
      drag.region = { id:`highlight-${Date.now()}`, x:Number(left.toFixed(2)), y:Number(top.toFixed(2)), width:Number(width.toFixed(2)), height:Number(height.toFixed(2)) };
    };
    wrap.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('[data-highlight]')) return;
      event.preventDefault();
      wrap.setPointerCapture(event.pointerId);
      const element = document.createElement('span');
      element.className = 'image-highlight is-draft';
      root.querySelector('#highlight-layer').append(element);
      drag = { pointerId:event.pointerId, start:point(event), element };
      drawDraft(drag.start);
    });
    wrap.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drawDraft(point(event));
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drawDraft(point(event));
      const region = drag.region;
      drag.element.remove();
      drag = undefined;
      if (region.width < 1 || region.height < 1) return;
      image.highlights.push(region);
      ctx.setField('caseImages', ctx.session.caseImages);
      renderRegions(root);
    };
    wrap.addEventListener('pointerup', finish);
    wrap.addEventListener('pointercancel', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.element.remove();
      drag = undefined;
    });
  });
}

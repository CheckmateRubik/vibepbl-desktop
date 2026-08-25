import { printReport } from '../components/print-report.js';

export function renderPrint(ctx) {
  const session = {
    ...ctx.session,
    caseImages: ctx.session.caseImages.map(image => ({ ...image, localPath: ctx.API.imageUrl(image.localPath) }))
  };
  document.getElementById('page').innerHTML = `
    <div class="print-preview-actions">
      <button id="back-from-print" class="button button-secondary" type="button">← Back to session</button>
      <button id="print-now" class="button button-primary" type="button">Print / Save as PDF</button>
    </div>
    <article class="print-report">${printReport(session)}</article>`;

  document.getElementById('back-from-print').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/objectives';
  });
  document.getElementById('print-now').addEventListener('click', () => window.print());
}

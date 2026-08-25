import { esc } from './helpers.js';

const hypothesisStatus = hypothesis => {
  const value = hypothesis.validation || (hypothesis.status === 'green' ? 'correct' : hypothesis.status === 'yellow' ? 'yellow' : 'pending');
  if (value === 'correct') return ['confirmed', 'CONFIRMED ✓'];
  if (value === 'wrong') return ['wrong', 'WRONG ✗'];
  if (value === 'yellow') return ['investigating', 'INVESTIGATING ⚡'];
  return ['', 'UNCHECKED'];
};

export function printReport(session, generatedAt = new Date().toISOString()) {
  const imageHighlights = image => (image.highlights || image.pins || []).filter(region => Number(region.width) > 0.5 && Number(region.height) > 0.5);
  return `
    <header class="report-head"><h1>${esc(session.title)}</h1><div class="meta"><span>Act 1 Clinical PBL Summary</span><span>${new Date(generatedAt).toLocaleString()}</span></div></header>
    <section class="print-section"><h2>Case images</h2>${session.caseImages.length ? session.caseImages.map(image => { const highlights = imageHighlights(image); return `<article class="print-image-card"><h3>${esc(image.originalName)}</h3><div class="print-image-wrap"><img src="${esc(image.localPath)}" alt="${esc(image.originalName)}">${highlights.map(region => `<span class="print-highlight" style="left:${region.x}%;top:${region.y}%;width:${region.width}%;height:${region.height}%"></span>`).join('')}</div>${highlights.length ? `<p class="highlight-summary">${highlights.length} highlighted region${highlights.length === 1 ? '' : 's'}</p>` : ''}</article>`; }).join('') : '<p class="empty">No case images recorded.</p>'}</section>
    <section class="print-section"><h2>Terminology glossary</h2>${session.terms.length ? `<table class="glossary"><thead><tr><th>Term</th><th>Clarification</th></tr></thead><tbody>${session.terms.map(term => `<tr><td><strong>${esc(term.name)}</strong></td><td>${esc(term.meaning)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No terms recorded.</p>'}</section>
    <section class="print-section"><h2>Clinical timeline</h2>${session.timeline.length ? session.timeline.map(event => `<div class="timeline-item"><strong>${esc(event.durationText)}</strong><span>${esc(event.content)}</span></div>`).join('') : '<p class="empty">No timeline events recorded.</p>'}</section>
    <section class="print-section"><h2>Problems & differential hypotheses</h2>${session.problems.length ? session.problems.map((problem, problemIndex) => `<article class="problem-card"><h3>P${problemIndex + 1} · ${esc(problem.text)}</h3>${problem.hypotheses.length ? problem.hypotheses.map((hypothesis, hypothesisIndex) => { const [type, label] = hypothesisStatus(hypothesis); return `<div class="hypothesis ${type === 'wrong' ? 'wrong-text' : ''}"><span class="status ${type}">${label}</span><strong>H${hypothesisIndex + 1}</strong><span>${esc(hypothesis.text)}</span></div>`; }).join('') : '<p class="empty">No hypotheses.</p>'}</article>`).join('') : '<p class="empty">No problems recorded.</p>'}</section>
    <section class="print-section"><h2>Learning objectives</h2>${session.objectives.length ? session.objectives.map((objective, index) => `<article class="objective"><strong>LO${index + 1} · ${esc(objective.text)}</strong><div>Linked problems: ${objective.linkedProblemIds.length ? objective.linkedProblemIds.map(id => { const problemIndex = session.problems.findIndex(problem => problem.id === id); return problemIndex >= 0 ? `P${problemIndex + 1}` : 'Removed problem'; }).join(', ') : 'None'}</div></article>`).join('') : '<p class="empty">No learning objectives recorded.</p>'}</section>`;
}

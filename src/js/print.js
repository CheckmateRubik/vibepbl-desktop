import { API } from './api.js';
import { esc } from './components/helpers.js';

const payload = await API.getPrintData();
const session = payload.session;
const status = hypothesis => {
  const value = hypothesis.validation || (hypothesis.status === 'green' ? 'correct' : hypothesis.status === 'yellow' ? 'yellow' : 'pending');
  return value === 'correct' ? ['confirmed','CONFIRMED ✓'] : value === 'wrong' ? ['wrong','WRONG ✗'] : value === 'yellow' ? ['investigating','INVESTIGATING ⚡'] : ['','UNCHECKED'];
};
document.getElementById('report').innerHTML = `
  <header class="report-head"><h1>${esc(session.title)}</h1><div class="meta"><span>Act 1 Clinical PBL Summary</span><span>${new Date(payload.generatedAt).toLocaleString()}</span></div></header>
  <section class="print-section"><h2>Clinical narrative</h2><div class="narrative">${session.caseText || '<p class="empty">No clinical narrative recorded.</p>'}</div></section>
  <section class="print-section"><h2>Clinical images & annotations</h2>${session.caseImages.length ? session.caseImages.map(image => `<article class="print-image-card"><h3>${esc(image.originalName)}</h3><img src="${API.imageUrl(image.localPath)}" alt="${esc(image.originalName)}">${image.pins.length ? `<table class="pin-table"><thead><tr><th>Pin</th><th>Clinical finding</th><th>Coordinates</th></tr></thead><tbody>${image.pins.map((pin,index) => `<tr><td>${index+1}</td><td>${esc(pin.label)}</td><td>${pin.x}%, ${pin.y}%</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No annotations.</p>'}</article>`).join('') : '<p class="empty">No clinical images recorded.</p>'}</section>
  <section class="print-section"><h2>Terminology glossary</h2>${session.terms.length ? `<table class="glossary"><thead><tr><th>Term</th><th>Clarification</th></tr></thead><tbody>${session.terms.map(term => `<tr><td><strong>${esc(term.name)}</strong></td><td>${esc(term.meaning)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No terms recorded.</p>'}</section>
  <section class="print-section"><h2>Clinical timeline</h2>${session.timeline.length ? session.timeline.map(event => `<div class="timeline-item"><strong>${esc(event.durationText)}</strong><span>${esc(event.content)}</span></div>`).join('') : '<p class="empty">No timeline events recorded.</p>'}</section>
  <section class="print-section"><h2>Problems & differential hypotheses</h2>${session.problems.length ? session.problems.map((problem,pIndex) => `<article class="problem-card"><h3>P${pIndex+1} · ${esc(problem.text)}</h3>${problem.hypotheses.length ? problem.hypotheses.map((hypothesis,hIndex) => { const [type,label]=status(hypothesis); return `<div class="hypothesis ${type==='wrong'?'wrong-text':''}"><span class="status ${type}">${label}</span><strong>H${hIndex+1}</strong><span>${esc(hypothesis.text)}</span></div>`; }).join('') : '<p class="empty">No hypotheses.</p>'}</article>`).join('') : '<p class="empty">No problems recorded.</p>'}</section>
  <section class="print-section"><h2>Learning objectives</h2>${session.objectives.length ? session.objectives.map((objective,index) => `<article class="objective"><strong>LO${index+1} · ${esc(objective.text)}</strong><div>Linked problems: ${objective.linkedProblemIds.length ? objective.linkedProblemIds.map(id => { const pIndex=session.problems.findIndex(problem=>problem.id===id); return pIndex >= 0 ? `P${pIndex+1}` : 'Removed problem'; }).join(', ') : 'None'}</div></article>`).join('') : '<p class="empty">No learning objectives recorded.</p>'}</section>`;
if (API.isNative) setTimeout(() => window.print(), 650);

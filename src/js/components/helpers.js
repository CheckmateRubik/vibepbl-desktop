export const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
export const sanitizeRichText = value => {
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  const allowedTags = new Set(['B', 'BR', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'STRONG', 'UL']);
  [...template.content.querySelectorAll('*')].forEach(element => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
  });
  return template.innerHTML;
};
export const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const pageHeader = (title, description, actions = '') => `<header class="page-header"><div><h2>${title}</h2><p>${description}</p></div><div class="header-actions">${actions}</div></header>`;
export const emptyState = (icon, title, detail) => `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${title}</strong><p>${detail}</p></div>`;
export const debounce = (fn, wait = 600) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };

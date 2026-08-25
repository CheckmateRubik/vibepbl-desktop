export function openModal(title, body, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><header class="modal-header"><strong>${title}</strong><button class="button button-ghost" data-close aria-label="Close">✕</button></header><div class="modal-body">${body}</div></section></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('[data-close]').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop')) close(); });
  onMount?.(root, close);
}

export function openFormModal(title, fields, onSubmit, submitLabel = 'Save') {
  const body = `<form id="modal-form" class="list-stack">${fields.map(field => `<div class="field"><label for="modal-${field.name}">${field.label}</label>${field.type === 'textarea' ? `<textarea id="modal-${field.name}" name="${field.name}" class="textarea" required>${field.value || ''}</textarea>` : field.type === 'select' ? `<select id="modal-${field.name}" name="${field.name}" class="select">${field.options.map(option => `<option value="${option.value}" ${option.value === field.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select>` : `<input id="modal-${field.name}" name="${field.name}" class="input" value="${field.value || ''}" ${field.required === false ? '' : 'required'}>`}</div>`).join('')}<div class="d-flex gap-2"><button class="button button-primary" type="submit">${submitLabel}</button><button class="button button-secondary" type="button" data-cancel>Cancel</button></div></form>`;
  openModal(title, body, (root, close) => {
    root.querySelector('[data-cancel]').addEventListener('click', close);
    root.querySelector('#modal-form').addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      onSubmit(values); close();
    });
    root.querySelector('input,textarea,select')?.focus();
  });
}

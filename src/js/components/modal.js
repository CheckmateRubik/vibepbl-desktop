import { esc } from './helpers.js';

export function openModal(title, body, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><header class="modal-header"><strong data-modal-title></strong><button class="button button-ghost" data-close aria-label="Close">✕</button></header><div class="modal-body">${body}</div></section></div>`;
  root.querySelector('[data-modal-title]').textContent = String(title ?? '');
  const close = () => { root.innerHTML = ''; };
  root.querySelector('[data-close]').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop')) close(); });
  onMount?.(root, close);
}

export function openFormModal(title, fields, onSubmit, submitLabel = 'Save') {
  const body = `<form id="modal-form" class="list-stack" autocomplete="off">${fields.map(field => {
    const name = esc(field.name);
    const value = esc(field.value || '');
    return `<div class="field"><label for="modal-${name}">${esc(field.label)}</label>${field.type === 'textarea' ? `<textarea id="modal-${name}" name="${name}" class="textarea" autocomplete="off" required>${value}</textarea>` : field.type === 'select' ? `<select id="modal-${name}" name="${name}" class="select" autocomplete="off">${field.options.map(option => `<option value="${esc(option.value)}" ${option.value === field.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select>` : `<input id="modal-${name}" name="${name}" class="input" autocomplete="off" value="${value}" ${field.required === false ? '' : 'required'}>`}</div>`;
  }).join('')}<div class="d-flex gap-2"><button class="button button-primary" type="submit">${esc(submitLabel)}</button><button class="button button-secondary" type="button" data-cancel>Cancel</button></div></form>`;
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

export function openConfirmModal(title, message, onConfirm, confirmLabel = 'Delete') {
  const body = `<p class="confirm-message">${esc(message)}</p><div class="modal-actions"><button class="button button-danger" type="button" data-confirm>${esc(confirmLabel)}</button><button class="button button-secondary" type="button" data-cancel>Cancel</button></div>`;
  openModal(title, body, (root, close) => {
    root.querySelector('[data-cancel]').addEventListener('click', close);
    root.querySelector('[data-confirm]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await onConfirm(); close(); }
      catch (error) {
        button.disabled = false;
        let message = root.querySelector('[role="alert"]');
        if (!message) { message = document.createElement('p'); message.setAttribute('role', 'alert'); root.querySelector('.modal-body').append(message); }
        message.textContent = String(error);
      }
    });
  });
}

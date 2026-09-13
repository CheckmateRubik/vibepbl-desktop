const invoke = window.__TAURI__?.core?.invoke;
const address = document.getElementById('address');
const status = document.getElementById('browser-status');

window.updateAddress = value => {
  try {
    const url = new URL(value);
    address.value = `${url.hostname}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    address.title = value;
  } catch {
    address.value = 'duckduckgo.com';
  }
};
if (window.__referenceUrl) window.updateAddress(window.__referenceUrl);

async function action(name) {
  status.textContent = '';
  try { await invoke('reference_browser_action', { action:name }); }
  catch (error) { status.textContent = String(error); }
}

document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.action)));
document.addEventListener('keydown', event => {
  if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  action(event.key === 'ArrowLeft' ? 'back' : 'forward');
});

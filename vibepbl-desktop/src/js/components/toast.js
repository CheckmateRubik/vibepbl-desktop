export function showToast(message, tone = '') {
  const region = document.getElementById('toast-region');
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`; toast.textContent = message; region.append(toast);
  setTimeout(() => toast.remove(), 3800);
}

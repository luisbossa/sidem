/* Utilidades de DOM. */
export const $ = id => document.getElementById(id);

export const escapar = val => String(val ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

export function mostrarElemento(id) {
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

export function ocultarElemento(id) {
  const el = $(id);
  if (el) el.classList.add('hidden');
}

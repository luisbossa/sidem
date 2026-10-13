/* Delegación de eventos: reemplaza los onclick/onchange/onsubmit en línea.
   En el HTML se usa:
     data-action="nombre"           → clic (también Enter/Espacio en role="button")
     data-change="nombre"           → cambio de select/input
     data-submit="nombre"           → envío de formulario
     data-backdrop-action="nombre"  → clic directo sobre el fondo de un modal
   Cada manejador recibe (elemento, evento); los parámetros van en data-*. */

const manejadores = { click: {}, change: {}, submit: {} };

export function registrarAcciones({ click = {}, change = {}, submit = {} }) {
  Object.assign(manejadores.click, click);
  Object.assign(manejadores.change, change);
  Object.assign(manejadores.submit, submit);
}

function ejecutar(tipo, nombre, el, evento) {
  const fn = manejadores[tipo][nombre];
  if (fn) fn(el, evento);
  else console.warn(`Acción no registrada: ${tipo} → ${nombre}`);
}

export function iniciarDelegacionEventos() {
  document.addEventListener('click', e => {
    const fondo = e.target.dataset && e.target.dataset.backdropAction;
    if (fondo) {
      ejecutar('click', fondo, e.target, e);
      return;
    }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    ejecutar('click', el.dataset.action, el, e);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[role="button"][data-action]');
    if (!el || el !== e.target) return;
    e.preventDefault();
    el.click();
  });

  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el) ejecutar('change', el.dataset.change, el, e);
  });

  document.addEventListener('submit', e => {
    const form = e.target.closest('[data-submit]');
    if (!form) return;
    e.preventDefault();
    ejecutar('submit', form.dataset.submit, form, e);
  });
}

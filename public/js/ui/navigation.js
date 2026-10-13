/* Cambio de vista y su renderizado asociado. */
import { $ } from '../core/dom.js';
import { estado } from '../core/state.js';
import { mostrarAlertaVisual } from './dialogs.js';
import { sincronizar } from '../data/storage.js';
import { renderDashboardIngenieria } from '../features/dashboard/render.js';
import { renderHistorial } from '../features/history.js';
import { renderDevolucionesInspector } from '../features/technician-reports.js';
import { renderCronograma } from '../features/schedule.js';
import { renderListaTecnicos } from '../features/users.js';
import { verificarAlertasDevolucionesInspector, actualizarBannerGuardiaInspector } from '../features/session.js';
import { actualizarOpcionesRecorridoDiario } from '../features/inspection.js';

const RENDER_POR_VISTA = {
  dashboard: renderDashboardIngenieria,
  historial: renderHistorial,
  devoluciones: renderDevolucionesInspector,
  cronograma: renderCronograma,
  tecnicos: renderListaTecnicos,
  inicio: () => {
    verificarAlertasDevolucionesInspector();
    actualizarBannerGuardiaInspector();
    actualizarOpcionesRecorridoDiario();
  }
};

/* Título que muestra la barra superior para cada vista */
const TITULO_POR_VISTA = {
  inicio: 'Inicio',
  devoluciones: 'Mis informes',
  cronograma: 'Rol semanal',
  inspeccion: 'Recorrido en curso',
  dashboard: 'Dashboard',
  historial: 'Historial de inspecciones',
  tecnicos: 'Gestión de usuarios'
};

export function mostrarVista(v) {
  const { inspeccionActiva, usuarioSesion } = estado;
  if (inspeccionActiva && usuarioSesion && usuarioSesion.rol === 'inspector' && v !== 'inspeccion') {
    mostrarAlertaVisual('Navegación bloqueada', 'Debe finalizar el recorrido o cancelarlo mediante el botón “Cancelar inspección” y justificar el motivo.', 'advertencia');
    return;
  }
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  const objetivo = $('vista-' + v);
  if (objetivo) objetivo.classList.add('active');
  const titulo = TITULO_POR_VISTA[v];
  if (titulo && $('tituloPagina')) {
    $('tituloPagina').textContent = titulo;
    document.title = `${titulo} · Casa de Máquinas`;
  }
  // Resalta la opción del menú que corresponde a la vista.
  document.querySelectorAll('.nav-item').forEach(b => {
    const activo = b.dataset.view === v;
    b.classList.toggle('active', activo);
    if (activo) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (RENDER_POR_VISTA[v]) RENDER_POR_VISTA[v]();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  recargarVista(v);
}

/* Trae del servidor los cambios de otros usuarios y vuelve a pintar la vista,
   salvo que el usuario ya haya cambiado de vista o tenga una ventana abierta. */
let ultimaRecarga = null;

function recargarVista(v) {
  if (!RENDER_POR_VISTA[v]) return;
  const recarga = sincronizar();
  ultimaRecarga = recarga;
  recarga
    .then(() => {
      if (ultimaRecarga !== recarga) return;
      if (!$('vista-' + v)?.classList.contains('active')) return;
      if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
      RENDER_POR_VISTA[v]();
    })
    .catch(e => console.warn('[SIDEM] No se pudieron actualizar los datos:', e.message));
}

/* Sesión dentro de la app: menú por rol, banners del inspector, cierre de sesión
   y restauración del recorrido al recargar. El inicio de sesión vive en features/login.js. */
import { $ } from '../core/dom.js';
import { estado } from '../core/state.js';
import { URL_LOGIN } from '../core/paths.js';
import { formatearFechaCompleta, formatearFechaCorta } from '../core/format.js';
import { sincronizar, cerrarSesionApi, leerRegistros, obtenerSemanaVigente, leerProgreso } from '../data/storage.js';
import { mostrarAlertaVisual } from '../ui/dialogs.js';
import { mostrarVista } from '../ui/navigation.js';
import { entrarEnRecorrido } from './inspection.js';

const BOTONES_INSPECTOR = ['btnIrInicioInspector', 'btnIrDevolucionesInspector', 'btnIrCronogramaInspector'];
const BOTONES_INGENIERO = ['btnIrDashboardIngeniero', 'btnIrHistorialIngeniero', 'btnIrCronogramaIngeniero', 'btnIrTecnicosIngeniero'];

/* El servidor solo renderiza el menú del rol de la sesión; los botones de otro rol no existen */
function alternarBotones(ids, visibles) {
  ids.forEach(id => $(id)?.classList.toggle('hidden', !visibles));
}

/* "Ing. Juan Pérez" → "JP" */
function iniciales(nombre) {
  const palabras = String(nombre).replace(/^(ing|tec|téc)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return palabras.slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
}

export function aplicarSesionUsuario() {
  const usuario = estado.usuarioSesion;
  if (!usuario) return;

  $('txtNombreUsuario').textContent = usuario.nombre;
  $('avatarUsuario').textContent = iniciales(usuario.nombre);
  const badge = $('badgeRolUsuario');
  const esInspector = usuario.rol === 'inspector';

  alternarBotones(BOTONES_INSPECTOR, esInspector);
  alternarBotones(BOTONES_INGENIERO, !esInspector);

  if (esInspector) {
    badge.textContent = 'Técnico Inspector';
    badge.className = 'role-badge role-badge-inspector';
    $('estadoCabecera').textContent = 'Inspector activo';
    verificarAlertasDevolucionesInspector();
    actualizarBannerGuardiaInspector();
    mostrarVista('inicio');
  } else {
    badge.textContent = 'Ingeniero Supervisor';
    badge.className = 'role-badge role-badge-engineer';
    $('estadoCabecera').textContent = 'Supervisor activo';
    mostrarVista('dashboard');
  }
}

export function actualizarBloqueoNavegacionTecnico() {
  const bloquear = Boolean(estado.inspeccionActiva && estado.usuarioSesion && estado.usuarioSesion.rol === 'inspector');
  [...BOTONES_INSPECTOR, 'btnCerrarSesion'].forEach(id => {
    const boton = $(id);
    if (boton) {
      boton.disabled = bloquear;
      boton.title = bloquear ? 'Finalice el recorrido o cancélelo con una justificación.' : '';
    }
  });
}

export function actualizarBannerGuardiaInspector() {
  const usuario = estado.usuarioSesion;
  if (!usuario || usuario.rol !== 'inspector') return;
  const semActual = obtenerSemanaVigente();
  const banner = $('bannerGuardiaSemanalInspector');

  if (semActual) {
    const leToca = semActual.tecnicoId === usuario.id;
    $('bannerGuardiaTitulo').textContent = leToca ? 'Te corresponde la guardia esta semana' : `Guardia semanal en curso: ${semActual.tecnico}`;
    $('bannerGuardiaMensaje').textContent = `Semana del ${formatearFechaCorta(semActual.inicio)} al ${formatearFechaCorta(semActual.fin)}. Técnico asignado: ${semActual.tecnico}.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

export function verificarAlertasDevolucionesInspector() {
  const usuario = estado.usuarioSesion;
  if (!usuario || usuario.rol !== 'inspector') return;
  const tieneObservaciones = leerRegistros().some(r => r.inspectorId === usuario.id && r.estadoRevision === 'Con observaciones');
  $('bannerAlertaObservaciones').classList.toggle('hidden', !tieneObservaciones);
}

export async function cerrarSesion() {
  if (estado.inspeccionActiva) {
    await mostrarAlertaVisual('Recorrido en curso', 'No puede cerrar sesión durante una inspección. Para salir debe usar “Cancelar inspección” y registrar una justificación.', 'advertencia');
    return;
  }
  try {
    await cerrarSesionApi();
  } catch (e) {
    console.warn('[SIDEM] Cierre de sesión:', e.message);
  }
  estado.usuarioSesion = null;
  location.replace(URL_LOGIN);
}

/* Al abrir la app: carga los datos de la sesión (sin sesión, storage.js redirige al login)
   y restaura el recorrido pendiente, si existe. */
export async function restaurarProgreso() {
  try {
    estado.usuarioSesion = await sincronizar();
  } catch (e) {
    if (e.estado === 401) return;
    await mostrarAlertaVisual(e.titulo || 'No se pudieron cargar los datos', e.message, 'advertencia');
    return;
  }

  $('fechaCabecera').textContent = formatearFechaCompleta(new Date());
  aplicarSesionUsuario();

  if (estado.usuarioSesion.rol !== 'inspector') return;
  // Solo vuelve el recorrido del que el técnico es responsable (si otro lo continuó, ya no le llega)
  const borrador = leerProgreso();
  if (borrador && borrador.inspeccionActiva) entrarEnRecorrido(borrador);
}

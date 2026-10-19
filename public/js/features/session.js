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
import { PERFILES, puedeInspeccionar } from '../core/roles.js';

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
  // El servidor solo renderiza el menú y las secciones que permite el rol de la sesión
  const perfil = PERFILES[usuario.rol] || PERFILES.inspector;
  const badge = $('badgeRolUsuario');
  badge.textContent = perfil.rolTexto;
  badge.className = `role-badge ${perfil.rolClase}`;
  $('estadoCabecera').textContent = perfil.estado;

  if (puedeInspeccionar(usuario.rol)) {
    verificarAlertasDevolucionesInspector();
    actualizarBannerGuardiaInspector();
  }
  mostrarVista(perfil.vistaInicial);
}

export function actualizarBloqueoNavegacionTecnico() {
  const bloquear = Boolean(estado.inspeccionActiva && estado.usuarioSesion && puedeInspeccionar(estado.usuarioSesion.rol));
  // Todo el menú (el del Supervisor Técnico incluye las opciones de ingeniería) y el cierre de sesión
  [...document.querySelectorAll('.nav-item'), $('btnCerrarSesion')].forEach(boton => {
    if (boton) {
      boton.disabled = bloquear;
      boton.title = bloquear ? 'Finalice el recorrido o cancélelo con una justificación.' : '';
    }
  });
}

export function actualizarBannerGuardiaInspector() {
  const usuario = estado.usuarioSesion;
  if (!usuario || !puedeInspeccionar(usuario.rol)) return;
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
  if (!usuario || !puedeInspeccionar(usuario.rol)) return;
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

  if (!puedeInspeccionar(estado.usuarioSesion.rol)) return;
  // Solo vuelve el recorrido del que el técnico es responsable (si otro lo continuó, ya no le llega)
  const borrador = leerProgreso();
  if (borrador && borrador.inspeccionActiva) entrarEnRecorrido(borrador);
}

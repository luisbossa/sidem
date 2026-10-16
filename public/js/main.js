/* Punto de entrada: conecta los data-action del HTML con las funciones y arranca la app.
   Para un botón nuevo: agregue data-action="nombre" en el HTML y registre "nombre" aquí. */
import { registrarAcciones, iniciarDelegacionEventos } from './ui/actions.js';
import { mostrarVista } from './ui/navigation.js';
import { pintarIconos } from './ui/icons.js';
import { cerrarSesion, restaurarProgreso } from './features/session.js';
import {
  iniciarInspeccion, continuarRecorridoAjeno, cancelarInspeccion, finalizarInspeccion, abrirSistema, guardarJustificacionSistema,
  volverAlListadoSistemas, guardarSistemaCompletado, cambioVerificacion
} from './features/inspection.js';
import { cambiarFiltroInformesTecnico } from './features/technician-reports.js';
import { cambiarFiltroHistorial, filtrarHistorialPorTecnico, quitarFiltroTecnico } from './features/history.js';
import {
  abrirModalAsignarSemana, cerrarModalCronograma, guardarSemanaCronograma, eliminarSemanaCronograma, actualizarFinSemanaAutomatica
} from './features/schedule.js';
import { abrirModalTecnico, cerrarModalTecnico, guardarTecnico, actualizarCamposPorRol, cambiarPermisoTomaRecorridos } from './features/users.js';
import { verDetalle, cerrarDetalle, guardarRevisionIngeniero, guardarRespuestaYReenviar, generarPdfInforme } from './features/report-detail.js';
import { cambiarPeriodoDashboard } from './features/dashboard/render.js';
import {
  cerrarDetalleDashboard, abrirInformeDesdeDashboard, abrirInformeConHallazgo, abrirDetalleCumplimiento,
  abrirDetalleFallas, abrirDetalleConsumo, abrirDetalleNoConformidades, abrirDetalleDuracion, abrirDetallePendientesSubsanar
} from './features/dashboard/details.js';

registrarAcciones({
  click: {
    // Navegación y sesión
    'show-view': el => mostrarVista(el.dataset.view),
    'logout': () => cerrarSesion(),

    // Recorrido
    'start-inspection': el => iniciarInspeccion(el.dataset.route),
    'take-route': el => continuarRecorridoAjeno(el.dataset.id),
    'cancel-inspection': () => cancelarInspeccion(),
    'finish-inspection': () => finalizarInspeccion(),
    'open-system': el => abrirSistema(Number(el.dataset.index)),
    'save-justification': el => guardarJustificacionSistema(Number(el.dataset.index)),
    'back-to-systems': () => volverAlListadoSistemas(),
    'save-system': () => guardarSistemaCompletado(),

    // Informes
    'open-report': el => verDetalle(el.dataset.id),
    'close-detail': () => cerrarDetalle(),
    'review-report': el => guardarRevisionIngeniero(el.dataset.id, el.dataset.status),
    'reply-report': el => guardarRespuestaYReenviar(el.dataset.id),
    'generate-pdf': () => generarPdfInforme(),

    // Historial
    'clear-technician-filter': () => quitarFiltroTecnico(),
    'filter-history-by-technician': el => filtrarHistorialPorTecnico(el.dataset.name),

    // Rol semanal
    'open-schedule-modal': el => abrirModalAsignarSemana(el.dataset.id || null),
    'close-schedule-modal': () => cerrarModalCronograma(),
    'delete-schedule-week': el => eliminarSemanaCronograma(el.dataset.id),

    // Usuarios
    'open-user-modal': el => abrirModalTecnico(el.dataset.id || null),
    'close-user-modal': () => cerrarModalTecnico(),

    // Dashboard
    'set-dashboard-period': el => cambiarPeriodoDashboard(Number(el.dataset.days)),
    'close-dashboard-detail': () => cerrarDetalleDashboard(),
    'open-report-from-dashboard': el => abrirInformeDesdeDashboard(el.dataset.id),
    'open-report-finding': el => abrirInformeConHallazgo(el.dataset.id, el.dataset.field, el.dataset.system),
    'open-compliance-detail': () => abrirDetalleCumplimiento(),
    'open-failures-detail': el => abrirDetalleFallas(el.dataset.system),
    'open-usage-detail': el => abrirDetalleConsumo(el.dataset.field, el.dataset.title, el.dataset.unit, el.dataset.color, el.dataset.mode),
    'open-nonconformities-detail': () => abrirDetalleNoConformidades(),
    'open-duration-detail': () => abrirDetalleDuracion(),
    'open-pending-detail': () => abrirDetallePendientesSubsanar()
  },

  change: {
    'verification-change': el => cambioVerificacion(el.name),
    'filter-technician-reports': el => cambiarFiltroInformesTecnico(el.dataset.filter, el.value),
    'filter-history': el => cambiarFiltroHistorial(el.dataset.filter, el.value),
    'filter-duration': el => abrirDetalleDuracion(el.value),
    'user-role-change': () => actualizarCamposPorRol(),
    'toggle-route-takeover': el => cambiarPermisoTomaRecorridos(el),
    'schedule-start-change': () => actualizarFinSemanaAutomatica()
  },

  submit: {
    'save-user': (form, e) => guardarTecnico(e),
    'save-schedule-week': (form, e) => guardarSemanaCronograma(e)
  }
});

pintarIconos();
iniciarDelegacionEventos();
restaurarProgreso();

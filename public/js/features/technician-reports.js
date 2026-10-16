/* Informes del técnico: listado propio con filtros por mes y estado. */
import { $, escapar } from '../core/dom.js';
import { estado } from '../core/state.js';
import { formatearFechaCompleta, formatearHoraExacta, formatearSegundos, claveMesInforme, etiquetaMes, etiquetaTipoRecorrido } from '../core/format.js';
import { leerRegistros } from '../data/storage.js';
import { icono } from '../ui/icons.js';

function categoriaEstadoInforme(registro) {
  if (registro.estadoRevision === 'Aprobada') return 'aprobada';
  if (registro.estadoRevision === 'Con observaciones') return 'devuelta';
  return 'pendiente';
}

/* Apariencia de la tarjeta según el estado de revisión */
function presentacionEstado(estadoRevision) {
  if (estadoRevision === 'Aprobada') return { clase: 'approved', icono: 'exito', titulo: 'Inspección Aprobada sin reparos' };
  if (estadoRevision === 'Con observaciones') return { clase: 'observed', icono: 'alerta', titulo: 'Devuelta con Observaciones Técnicas (Requiere tu respuesta)' };
  if (estadoRevision === 'Respuesta enviada por técnico') return { clase: 'pending', icono: 'correo', titulo: 'Subsanación y respuesta enviada al Ingeniero' };
  return { clase: 'pending', icono: 'reloj', titulo: 'En espera de revisión por el Ingeniero' };
}

export function cambiarFiltroInformesTecnico(tipo, valor) {
  if (tipo === 'mes') estado.filtroMesInformesTecnico = valor;
  if (tipo === 'estado') estado.filtroEstadoInformesTecnico = valor;
  renderDevolucionesInspector();
}

function plantillaFiltros(meses, totalFiltrados, total) {
  const mesActivo = estado.filtroMesInformesTecnico;
  const estadoActivo = estado.filtroEstadoInformesTecnico;
  const opcionEstado = (valor, texto) => `<option value="${valor}" ${estadoActivo === valor ? 'selected' : ''}>${texto}</option>`;
  return `
    <div class="report-filters">
      <div class="form-field">
        <label for="filtroMesInformesTecnico">Filtrar por mes</label>
        <select id="filtroMesInformesTecnico" data-change="filter-technician-reports" data-filter="mes">
          <option value="todos" ${mesActivo === 'todos' ? 'selected' : ''}>Todos los meses</option>
          ${meses.map(mes => `<option value="${mes}" ${mesActivo === mes ? 'selected' : ''}>${escapar(etiquetaMes(mes))}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="filtroEstadoInformesTecnico">Filtrar por estado</label>
        <select id="filtroEstadoInformesTecnico" data-change="filter-technician-reports" data-filter="estado">
          ${opcionEstado('todos', 'Todos los estados')}
          ${opcionEstado('pendiente', 'Pendientes de aprobación')}
          ${opcionEstado('aprobada', 'Aprobados')}
          ${opcionEstado('devuelta', 'Devueltos con observaciones')}
        </select>
      </div>
      <div class="filter-summary">${totalFiltrados} de ${total} informe(s)</div>
    </div>`;
}

function plantillaInforme(r) {
  const p = presentacionEstado(r.estadoRevision);
  // Solo responde las observaciones quien completó el recorrido
  const conObservaciones = r.estadoRevision === 'Con observaciones';
  const devuelta = conObservaciones && r.inspectorId === estado.usuarioSesion.id;

  const revision = r.ingenieroRevisor ? `
    <div class="verdict-review ${conObservaciones ? 'verdict-review-returned' : ''}">
      <strong class="verdict-review-title">Dictamen por: ${escapar(r.ingenieroRevisor)} (${escapar(formatearFechaCompleta(r.fechaRevisionISO))})</strong>
      <div class="verdict-review-body">
        ${r.observacionesIngeniero
          ? `<strong>Indicaciones del Ingeniero:</strong><p class="verdict-notes">${escapar(r.observacionesIngeniero)}</p>`
          : '<em>Inspección revisada y aprobada en su totalidad sin observaciones pendientes.</em>'}
      </div>
    </div>` : `
    <p class="verdict-waiting">El informe del recorrido está en la bandeja del Ingeniero a la espera de su revision.</p>`;

  const respuesta = r.respuestaTecnico ? `
    <div class="verdict-reply">
      <strong>Tu última respuesta enviada (${escapar(formatearFechaCompleta(r.fechaRespuestaTecnicoISO))} - ${escapar(formatearHoraExacta(r.fechaRespuestaTecnicoISO))}):</strong>
      <p>${escapar(r.respuestaTecnico)}</p>
    </div>` : '';

  return `
    <article class="verdict-box ${p.clase}">
      <header class="verdict-header">
        <h4>${icono(p.icono)} ${p.titulo}</h4>
        <span class="tag ${r.resultado === 'Conforme' ? 'tag-green' : 'tag-red'}">${escapar(r.resultado)}</span>
      </header>
      <div class="verdict-meta">
        <div><strong>Fecha:</strong> ${escapar(formatearFechaCompleta(r.fechaISO || r.horaInicioISO))}</div>
        <div><strong>Recorrido:</strong> ${etiquetaTipoRecorrido(r.tipoRecorrido, { conIcono: false })}</div>
        <div><strong>Horario:</strong> ${escapar(formatearHoraExacta(r.horaInicioISO))} - ${escapar(r.horaFinISO ? formatearHoraExacta(r.horaFinISO) : '—')}</div>
        ${r.iniciadoPor ? '<div><strong>Iniciado por:</strong> ' + escapar(r.iniciadoPor) + ' · <strong>Completado por:</strong> ' + escapar(r.inspector) + '</div>' : ''}
        <div><strong>Duración:</strong> ${formatearSegundos(r.duracionSegundos)}</div>
      </div>
      ${revision}
      ${respuesta}
      <footer class="verdict-actions">
        ${devuelta ? `<button type="button" class="btn btn-green btn-sm" data-action="open-report" data-id="${r.id}">${icono('enviar')} Responder y Reenviar Informe</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-action="open-report" data-id="${r.id}">Ver reporte completo</button>
      </footer>
    </article>`;
}

export function renderDevolucionesInspector() {
  if (!estado.usuarioSesion) return;
  const div = $('devolucionesContenido');
  const misRegistros = leerRegistros()
    .filter(r => r.inspectorId === estado.usuarioSesion.id || r.iniciadoPorId === estado.usuarioSesion.id)
    .sort((a, b) => new Date(b.fechaISO || b.horaInicioISO) - new Date(a.fechaISO || a.horaInicioISO));

  if (!misRegistros.length) {
    div.innerHTML = '<p class="empty-state">Aún no has registrado inspecciones en este dispositivo.</p>';
    return;
  }

  const meses = [...new Set(misRegistros.map(r => claveMesInforme(r.fechaISO || r.horaInicioISO)).filter(Boolean))].sort().reverse();
  if (estado.filtroMesInformesTecnico !== 'todos' && !meses.includes(estado.filtroMesInformesTecnico)) estado.filtroMesInformesTecnico = 'todos';

  const filtrados = misRegistros.filter(r => {
    const coincideMes = estado.filtroMesInformesTecnico === 'todos' || claveMesInforme(r.fechaISO || r.horaInicioISO) === estado.filtroMesInformesTecnico;
    const coincideEstado = estado.filtroEstadoInformesTecnico === 'todos' || categoriaEstadoInforme(r) === estado.filtroEstadoInformesTecnico;
    return coincideMes && coincideEstado;
  });

  const filtros = plantillaFiltros(meses, filtrados.length, misRegistros.length);
  div.innerHTML = filtrados.length
    ? `${filtros}<div class="report-list">${filtrados.map(plantillaInforme).join('')}</div>`
    : `${filtros}<p class="empty-state empty-state-dashed">No hay informes que coincidan con los filtros seleccionados.</p>`;
}

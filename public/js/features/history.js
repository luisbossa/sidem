/* Historial del ingeniero: informes de inspección, con filtros por técnico y mes. */
import { $, escapar } from '../core/dom.js';
import { icono } from '../ui/icons.js';
import { estado } from '../core/state.js';
import { formatearFechaCompleta, formatearHoraExacta, formatearSegundos, claveMesInforme, etiquetaMes, etiquetaTipoRecorrido } from '../core/format.js';
import { leerRegistros } from '../data/storage.js';
import { mostrarVista } from '../ui/navigation.js';

function claseEstadoRevision(estadoRevision) {
  if (estadoRevision === 'Aprobada') return 'tag-approved';
  if (estadoRevision === 'Con observaciones') return 'tag-red';
  if (estadoRevision === 'Respuesta enviada por técnico') return 'tag-green';
  return 'tag-review';
}

export function cambiarFiltroHistorial(tipo, valor) {
  if (tipo === 'tecnico') estado.filtroTecnicoActivo = valor === 'todos' ? null : valor;
  if (tipo === 'mes') estado.filtroMesHistorial = valor;
  renderHistorial();
}

function plantillaFiltros(tecnicos, meses, totalInspecciones) {
  return `
    <div class="history-filters">
      <div class="form-field">
        <label for="filtroTecnicoHistorial">Filtrar por técnico</label>
        <select id="filtroTecnicoHistorial" data-change="filter-history" data-filter="tecnico">
          <option value="todos" ${!estado.filtroTecnicoActivo ? 'selected' : ''}>Todos los técnicos</option>
          ${tecnicos.map(nombre => `<option value="${escapar(nombre)}" ${estado.filtroTecnicoActivo === nombre ? 'selected' : ''}>${escapar(nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="filtroMesHistorial">Filtrar por mes</label>
        <select id="filtroMesHistorial" data-change="filter-history" data-filter="mes">
          <option value="todos" ${estado.filtroMesHistorial === 'todos' ? 'selected' : ''}>Todos los meses</option>
          ${meses.map(mes => `<option value="${mes}" ${estado.filtroMesHistorial === mes ? 'selected' : ''}>${escapar(etiquetaMes(mes))}</option>`).join('')}
        </select>
      </div>
      <div class="filter-summary">${totalInspecciones} inspección(es)</div>
    </div>`;
}

function plantillaTablaInspecciones(lista) {
  if (!lista.length) return '<p class="empty-state empty-state-sm">No hay inspecciones finalizadas con estos filtros.</p>';
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha</th><th>Inspector</th><th>Recorrido</th><th>Horarios</th>
            <th>Duración</th><th>Resultado</th><th>Estado Supervisión</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(r => `
            <tr>
              <td>${escapar(formatearFechaCompleta(r.fechaISO || r.horaInicioISO))}</td>
              <td>${escapar(r.inspector || 'Técnico')}${r.iniciadoPor ? `<br><small>Iniciado por ${escapar(r.iniciadoPor)}</small>` : ''}</td>
              <td><strong>${etiquetaTipoRecorrido(r.tipoRecorrido, { vacio: '—' })}</strong></td>
              <td>${escapar(formatearHoraExacta(r.horaInicioISO))} - ${escapar(r.horaFinISO ? formatearHoraExacta(r.horaFinISO) : '—')}</td>
              <td>${formatearSegundos(r.duracionSegundos)}</td>
              <td><span class="tag ${r.resultado === 'Conforme' ? 'tag-green' : 'tag-red'}">${escapar(r.resultado)}</span></td>
              <td><span class="tag ${claseEstadoRevision(r.estadoRevision)}">${escapar(r.estadoRevision || 'Pendiente')}</span></td>
              <td><button type="button" class="btn btn-blue btn-xs" data-action="open-report" data-id="${r.id}">Revisar reporte</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function renderHistorial() {
  const todosLosRegistros = leerRegistros();
  const div = $('historialContenido');
  const tecnicos = [...new Set(todosLosRegistros.map(r => r.inspector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const meses = [...new Set(todosLosRegistros.map(r => claveMesInforme(r.fechaISO || r.horaInicioISO)).filter(Boolean))].sort().reverse();

  if (estado.filtroTecnicoActivo && !tecnicos.includes(estado.filtroTecnicoActivo)) estado.filtroTecnicoActivo = null;
  if (estado.filtroMesHistorial !== 'todos' && !meses.includes(estado.filtroMesHistorial)) estado.filtroMesHistorial = 'todos';

  const coincide = (r, fecha) =>
    (!estado.filtroTecnicoActivo || r.inspector === estado.filtroTecnicoActivo) &&
    (estado.filtroMesHistorial === 'todos' || claveMesInforme(fecha) === estado.filtroMesHistorial);

  const lista = todosLosRegistros
    .filter(r => coincide(r, r.fechaISO || r.horaInicioISO))
    .sort((a, b) => new Date(b.fechaISO || b.horaInicioISO) - new Date(a.fechaISO || a.horaInicioISO));

  $('tituloSupervisionIngeniero').innerHTML = `${icono('buscar')} ${estado.filtroTecnicoActivo ? `Inspecciones de: ${escapar(estado.filtroTecnicoActivo)}` : 'Historial de informes'}`;
  $('btnQuitarFiltroTecnico').classList.toggle('hidden', !estado.filtroTecnicoActivo);

  const filtros = plantillaFiltros(tecnicos, meses, lista.length);
  if (!lista.length) {
    div.innerHTML = filtros + '<p class="empty-state empty-state-dashed">No existen inspecciones que coincidan con los filtros seleccionados.</p>';
    return;
  }
  div.innerHTML = filtros + plantillaTablaInspecciones(lista);
}

export function filtrarHistorialPorTecnico(nombreTecnico) {
  estado.filtroTecnicoActivo = nombreTecnico;
  mostrarVista('historial');
}

export function quitarFiltroTecnico() {
  estado.filtroTecnicoActivo = null;
  renderHistorial();
}

/* Rol semanal: consulta, programación, edición y eliminación de semanas (de lunes a viernes). */
import { $, escapar } from '../core/dom.js';
import { estado } from '../core/state.js';
import { formatearFechaCorta, formatearDiaSemana, fechaLocalISO, lunesDeLaSemana, sumarDias, DIAS_SEMANA_ROL } from '../core/format.js';
import { puedeInspeccionar, puedeSupervisar } from '../core/roles.js';
import { leerCronograma, guardarSemana, eliminarSemana, leerUsuarios } from '../data/storage.js';
import { mostrarAlertaVisual, mostrarConfirmacionVisual } from '../ui/dialogs.js';
import { icono } from '../ui/icons.js';

// Modifica el rol quien supervisa; se asigna a cualquiera que haga recorridos
const esIngeniero = () => Boolean(estado.usuarioSesion && puedeSupervisar(estado.usuarioSesion.rol));

function plantillaSemana(sem, hoyStr, editable) {
  const esVigente = hoyStr >= sem.inicio && hoyStr <= sem.fin;
  const esPasada = hoyStr > sem.fin;
  const estadoTexto = esVigente ? 'EN CURSO' : (esPasada ? 'Completada' : 'Programada');
  const estadoClase = esVigente ? 'tag-current' : (esPasada ? 'tag-review' : 'tag-approved');
  const tipoTexto = esVigente ? 'Semana actual' : (esPasada ? 'Semana finalizada' : 'Próxima semana');
  const tipoIcono = icono(esVigente ? 'estrella' : (esPasada ? 'check' : 'pin'));

  return `
    <article class="schedule-item ${esVigente ? 'current' : ''}">
      <div class="schedule-week-type">
        <span class="schedule-week-icon" aria-hidden="true">${tipoIcono}</span>
        <span>${tipoTexto}</span>
      </div>
      <div class="schedule-dates">
        <strong>${icono('calendario')} ${formatearDiaSemana(sem.inicio)}</strong>
        <small>hasta el ${formatearDiaSemana(sem.fin)}</small>
      </div>
      <div>
        <div class="schedule-technician">
          <strong>${icono('casco')} ${escapar(sem.tecnico)}</strong>
          <small>Técnico asignado al recorrido</small>
        </div>
        <p class="schedule-notes">${escapar(sem.notas || 'Sin notas especiales para esta semana.')}</p>
      </div>
      <div><span class="tag ${estadoClase}">${estadoTexto}</span></div>
      ${editable ? `
        <div class="schedule-actions">
          <button type="button" class="btn btn-secondary" data-action="open-schedule-modal" data-id="${sem.id}">${icono('editar')} Editar</button>
          <button type="button" class="btn btn-red" data-action="delete-schedule-week" data-id="${sem.id}" title="Eliminar semana">${icono('eliminar')} Eliminar</button>
        </div>` : ''}
    </article>`;
}

export function renderCronograma() {
  const cronograma = leerCronograma();
  const div = $('cronogramaContenido');
  const editable = esIngeniero();
  const hoyStr = fechaLocalISO(new Date());

  $('btnAgregarSemanaCronograma').classList.toggle('hidden', !editable);

  if (!cronograma.length) {
    div.innerHTML = `
      <div class="schedule-empty">
        <div class="schedule-empty-icon">${icono('calendario')}</div>
        <div class="schedule-empty-title">No hay semanas programadas</div>
        <div class="schedule-empty-text">Cuando se asigne un recorrido semanal aparecerá aquí.</div>
      </div>`;
    return;
  }

  cronograma.sort((a, b) => a.inicio.localeCompare(b.inicio));
  const vigentes = cronograma.filter(sem => hoyStr >= sem.inicio && hoyStr <= sem.fin).length;
  const futuras = cronograma.filter(sem => hoyStr < sem.inicio).length;
  const completadas = cronograma.filter(sem => hoyStr > sem.fin).length;

  div.innerHTML = `
    <div class="schedule-summary">
      <div class="schedule-stat current"><small>Semana en curso</small><strong>${vigentes}</strong></div>
      <div class="schedule-stat"><small>Próximas semanas</small><strong>${futuras}</strong></div>
      <div class="schedule-stat"><small>Semanas completadas</small><strong>${completadas}</strong></div>
    </div>
    <div class="schedule-legend">
      <span><i class="legend-dot legend-current"></i> En curso</span>
      <span><i class="legend-dot legend-scheduled"></i> Programada</span>
      <span><i class="legend-dot legend-done"></i> Completada</span>
    </div>
    <div class="schedule-list">${cronograma.map(sem => plantillaSemana(sem, hoyStr, editable)).join('')}</div>`;
}

export function abrirModalAsignarSemana(id = null) {
  if (!esIngeniero()) return;
  $('formCronograma').reset();
  $('cronogramaId').value = '';
  $('ayudaCronogramaInicio').textContent = 'Elija el lunes de la semana; el cierre se calcula solo (viernes).';

  const tecnicosActivos = leerUsuarios().filter(u => puedeInspeccionar(u.rol) && u.estado === 'Activo');
  if (!tecnicosActivos.length) {
    mostrarAlertaVisual('Sin técnicos disponibles', 'No hay técnicos inspectores activos para asignar al rol.', 'advertencia');
    return;
  }
  $('cronogramaTecnico').innerHTML = tecnicosActivos.map(t => `<option value="${escapar(t.id)}">${escapar(t.nombre)}${t.turno ? ` (${escapar(t.turno)})` : ''}</option>`).join('');

  const item = id ? leerCronograma().find(x => x.id === id) : null;
  if (item) {
    $('modalCronogramaTitulo').textContent = 'Editar Asignación de Semana';
    $('cronogramaId').value = item.id;
    // Una semana antigua (de lunes a domingo) se guarda de lunes a viernes al editarla
    $('cronogramaFechaInicio').value = item.inicio;
    actualizarFinSemanaAutomatica();
    $('cronogramaTecnico').value = item.tecnicoId;
    $('cronogramaNotas').value = item.notas || '';
  } else if (!id) {
    $('modalCronogramaTitulo').textContent = 'Programar Nueva Semana de Recorrido';
  }

  $('modalCronograma').classList.remove('hidden');
}

/* La semana empieza el lunes y termina el viernes: si se elige otro día se ajusta al lunes de esa semana
   (sábado o domingo pasan al lunes siguiente) */
export function actualizarFinSemanaAutomatica() {
  const elegido = $('cronogramaFechaInicio').value;
  if (!elegido) {
    $('cronogramaFechaFin').value = '';
    return;
  }
  const lunes = lunesDeLaSemana(elegido);
  $('cronogramaFechaInicio').value = lunes;
  $('cronogramaFechaFin').value = sumarDias(lunes, DIAS_SEMANA_ROL - 1);
  $('ayudaCronogramaInicio').textContent = lunes === elegido
    ? `Semana del ${formatearDiaSemana(lunes)} al ${formatearDiaSemana($('cronogramaFechaFin').value)}.`
    : `Se ajustó al lunes de esa semana: ${formatearDiaSemana(lunes)}.`;
}

export function cerrarModalCronograma() {
  $('modalCronograma').classList.add('hidden');
}

export async function guardarSemanaCronograma(e) {
  if (e) e.preventDefault();
  if (!esIngeniero()) return;

  const id = $('cronogramaId').value;
  const inicio = $('cronogramaFechaInicio').value;
  const fin = $('cronogramaFechaFin').value;
  const tecnicoId = $('cronogramaTecnico').value;
  const notas = $('cronogramaNotas').value.trim();

  if (!inicio || !fin || !tecnicoId) {
    await mostrarAlertaVisual('Campos requeridos', 'Debe seleccionar la fecha de inicio y el técnico asignado.', 'advertencia');
    return;
  }

  let semana;
  try {
    semana = await guardarSemana({ id: id || undefined, inicio, fin, tecnicoId, notas });
  } catch (e) {
    await mostrarAlertaVisual(e.titulo || 'No se pudo guardar la semana', e.message, 'advertencia');
    return;
  }

  cerrarModalCronograma();
  renderCronograma();
  await mostrarAlertaVisual('Cronograma Actualizado', `La semana del ${formatearFechaCorta(inicio)} al ${formatearFechaCorta(fin)} ha sido asignada al técnico ${semana.tecnico}.`, 'exito');
}

export async function eliminarSemanaCronograma(id) {
  if (!esIngeniero()) return;
  const confirmar = await mostrarConfirmacionVisual('¿Eliminar Semana del Rol?', 'Esta semana se removerá de la programación de recorridos.', 'Sí, eliminar', 'advertencia');
  if (!confirmar) return;
  try {
    await eliminarSemana(id);
  } catch (e) {
    await mostrarAlertaVisual(e.titulo || 'No se pudo eliminar la semana', e.message, 'advertencia');
    return;
  }
  renderCronograma();
}

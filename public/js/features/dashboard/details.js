/* Modales de detalle de cada indicador del dashboard. */
import { $, escapar } from '../../core/dom.js';
import { icono } from '../../ui/icons.js';
import { formatearFechaCompleta, formatearHoraExacta, formatearSegundos } from '../../core/format.js';
import { leerRegistros } from '../../data/storage.js';
import { verDetalle } from '../report-detail.js';
import {
  registrosPeriodoDashboard, textoPeriodo, extraerSerieConsumo, resumenSerie, agruparSerieDashboard,
  formatoNumeroDashboard, formatoConsumo, formatoNivelTanque, esConsumoDiesel, tieneBancos, extraerSeriesBancos, unirSeriesBancos, etiquetaGrupoConsumo, calcularCumplimiento, registrosFallasSistema,
  obtenerDetalleNoConformidades
} from './calculations.js';

/* Contenedor del modal */
export function abrirModalDashboard(titulo, html) {
  $('modalDashboardTitulo').textContent = titulo;
  $('modalDashboardContenido').innerHTML = html;
  $('modalDashboardDetalle').classList.remove('hidden');
}

export function cerrarDetalleDashboard() {
  const m = $('modalDashboardDetalle');
  if (m) m.classList.add('hidden');
}

export function abrirInformeDesdeDashboard(registroId) {
  cerrarDetalleDashboard();
  verDetalle(registroId);
}

export function abrirInformeConHallazgo(registroId, campoId, sistemaCodificado) {
  cerrarDetalleDashboard();
  verDetalle(registroId, campoId, decodeURIComponent(sistemaCodificado || ''));
}

/* Piezas comunes */
const barraHerramientas = (titulo, subtitulo, extra = '') => `
  <div class="detail-toolbar">
    <div><strong class="detail-toolbar-title">${titulo}</strong><div class="detail-toolbar-sub">${subtitulo}</div></div>
    ${extra}
  </div>`;

const tarjetaResumen = (etiqueta, valor, claseValor = '') =>
  `<div class="detail-summary-card"><div class="detail-summary-label">${etiqueta}</div><div class="detail-summary-value ${claseValor}">${valor}</div></div>`;

const botonInforme = (id, variante = 'blue') =>
  `<button type="button" class="btn btn-${variante} btn-xs" data-action="open-report-from-dashboard" data-id="${id}">Ver informe</button>`;

const tabla = (encabezados, filas) =>
  `<div class="table-scroll"><table class="data-table"><thead><tr>${encabezados}</tr></thead><tbody>${filas}</tbody></table></div>`;

const tablaDashboard = (titulo, contador, cuerpo) => `
  <div class="dashboard-table dashboard-table-flush">
    <div class="dashboard-table-header"><h4>${titulo}</h4><span class="count-badge">${contador}</span></div>
    ${cuerpo}
  </div>`;

/* Cumplimiento */
export function abrirDetalleCumplimiento() {
  const cumplimiento = calcularCumplimiento(registrosPeriodoDashboard());
  const periodoTexto = textoPeriodo('Todo el historial programado');

  if (!cumplimiento.programadas) {
    abrirModalDashboard('Cumplimiento de recorridos', `
      <div class="dashboard-empty dashboard-empty-lg">
        <div>
          <div class="empty-icon">${icono('calendario')}</div>
          <div class="empty-title">Sin programación en este período</div>
          <div>No existen recorridos programados en el Rol Semanal para ${escapar(periodoTexto.toLowerCase())}.</div>
        </div>
      </div>`);
    return;
  }

  const faltantes = cumplimiento.detalle.filter(x => !x.realizado);
  const horaCorta = d => d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '—';

  const renderFila = x => {
    const fechaTxt = x.fechaObj.toLocaleDateString('es-CR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '');
    if (!x.realizado) return `
      <tr>
        <td><strong>${escapar(fechaTxt)}</strong></td>
        <td>${escapar(x.tecnico)}</td>
        <td><span class="status-pill status-pill-bad">${icono('cerrar')} No realizado</span></td>
        <td colspan="2" class="cell-danger">Recorrido no registrado</td>
      </tr>`;

    const r = x.registro;
    const inicio = r.horaInicioISO ? new Date(r.horaInicioISO) : null;
    const fin = r.horaFinISO ? new Date(r.horaFinISO) : null;
    const duracion = Number.isFinite(Number(r.duracionSegundos)) ? formatearSegundos(Number(r.duracionSegundos)) : '—';
    return `
      <tr>
        <td><strong>${escapar(fechaTxt)}</strong></td>
        <td>${escapar(x.tecnico)}</td>
        <td><span class="status-pill status-pill-ok">${icono('check')} Realizado</span></td>
        <td>${escapar(horaCorta(inicio))} – ${escapar(horaCorta(fin))}<div class="cell-sub">${escapar(duracion)}</div></td>
        <td>${botonInforme(r.id, 'secondary')}</td>
      </tr>`;
  };

  const faltantesHtml = faltantes.length ? `
    <section class="detail-block detail-block-danger">
      <div class="detail-block-header">
        <div class="detail-block-title">${icono('cerrar')} Recorridos no realizados</div>
        <div class="detail-block-sub">Técnico y fecha en que existía un recorrido programado, pero no se encontró un informe registrado.</div>
      </div>
      ${tabla('<th>Fecha</th><th>Técnico asignado</th><th>Estado</th><th colspan="2">Detalle</th>', faltantes.map(renderFila).join(''))}
    </section>` : `
    <div class="detail-success-note">${icono('check')} Todos los recorridos programados del período fueron realizados.</div>`;

  const todosHtml = `
    <section class="detail-block">
      <div class="detail-block-header">
        <div class="detail-block-title">Historial de cumplimiento</div>
        <div class="detail-block-sub">Todos los recorridos programados dentro del período seleccionado.</div>
      </div>
      ${tabla('<th>Fecha</th><th>Técnico asignado</th><th>Estado</th><th>Horario / duración</th><th>Informe</th>', cumplimiento.detalle.map(renderFila).join(''))}
    </section>`;

  abrirModalDashboard('Cumplimiento de recorridos', `
    ${barraHerramientas(escapar(periodoTexto), 'Comparación entre el Rol Semanal y los informes efectivamente registrados.')}
    <div class="detail-summary-grid">
      ${tarjetaResumen('Programados', cumplimiento.programadas)}
      ${tarjetaResumen('Realizados', cumplimiento.realizadas, 'text-success')}
      ${tarjetaResumen('No realizados', cumplimiento.noRealizadas, 'text-danger')}
      ${tarjetaResumen('Cumplimiento', `${formatoNumeroDashboard(cumplimiento.porcentaje, 1)}%`)}
    </div>
    <div class="compliance-bar compliance-bar-lg"><span style="--fill:${cumplimiento.porcentaje}%"></span></div>
    ${faltantesHtml}
    ${todosHtml}`);
}

/* Fallas por sistema */
export function abrirDetalleFallas(nombreCodificado) {
  const nombre = decodeURIComponent(nombreCodificado);
  const fallas = registrosFallasSistema(nombre);
  const tecnicos = new Set(fallas.map(x => x.registro.inspector || 'Sin técnico'));
  const fecha = x => escapar(formatearFechaCompleta(x.fecha));

  const lista = fallas.length ? `<div class="failure-list">${fallas.map(x => `
    <article class="failure-item">
      <div class="failure-item-top">
        <div>
          <div class="failure-item-title">${escapar(x.campo)}</div>
          <div class="failure-item-meta">${fecha(x)} · ${escapar(x.registro.inspector || 'Técnico')}</div>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" data-action="open-report-finding" data-id="${x.registro.id}" data-field="${x.campoId}" data-system="${encodeURIComponent(nombre)}">Ver en informe</button>
      </div>
      <div class="failure-item-text">${escapar(x.texto)}</div>
    </article>`).join('')}</div>`
    : '<div class="dashboard-empty">No hay fallas registradas para este sistema en el período seleccionado.</div>';

  abrirModalDashboard(`Fallas · ${nombre}`, `
    ${barraHerramientas(escapar(nombre), `${textoPeriodo()} · detalle trazable a cada informe`)}
    <div class="detail-summary-grid">
      ${tarjetaResumen('Fallas reportadas', fallas.length)}
      ${tarjetaResumen('Técnicos que reportaron', tecnicos.size)}
      ${tarjetaResumen('Primer reporte', fallas.length ? fecha(fallas[fallas.length - 1]) : '—', 'detail-summary-value-sm')}
      ${tarjetaResumen('Último reporte', fallas.length ? fecha(fallas[0]) : '—', 'detail-summary-value-sm')}
    </div>
    ${lista}`);
}

/* Consumos (agua, diésel y gases) */
function renderGraficaDetalleConsumo(grupos, unidad, color, modo, formato) {
  if (!grupos.length) return '<div class="dashboard-empty">No existen datos para graficar.</div>';
  const max = Math.max(...grupos.map(g => g.valor), 1);
  const promedio = grupos.reduce((a, g) => a + g.valor, 0) / grupos.length;
  const avgPct = Math.max(0, Math.min(100, (promedio / max) * 100));
  return `<div class="detail-chart-scroll"><div class="detail-chart">
    <div class="detail-average-line" style="--avg:${avgPct}%"><span>Promedio ${escapar(formato(promedio))} ${unidad}</span></div>
    ${grupos.map(g => `<div class="detail-bar-wrap"><div class="detail-bar" style="--bar-height:${Math.max(3, (g.valor / max) * 100)}%; --bar-color:${color};" data-value="${escapar(formato(g.valor))} ${unidad}"></div><span class="detail-bar-label">${escapar(etiquetaGrupoConsumo(g.clave, modo))}</span></div>`).join('')}
  </div></div>`;
}

/* Bancos de gases: colores de la paleta categórica validada (azul y naranja, distinguibles con daltonismo) */
const BANCOS = [
  { lado: 'izquierdo', nombre: 'Banco izquierdo', color: '#2a78d6' },
  { lado: 'derecho', nombre: 'Banco derecho', color: '#eb6834' }
];

/* Gráfica con una barra por banco en cada día o mes. El valor de cada barra se ve al pasar el cursor */
function renderGraficaBancos(gruposPorBanco, unidad, modo) {
  const claves = [...new Set(BANCOS.flatMap(b => gruposPorBanco[b.lado].map(g => g.clave)))].sort();
  if (!claves.length) return '<div class="dashboard-empty">No existen datos para graficar.</div>';
  const valorDe = (lado, clave) => gruposPorBanco[lado].find(g => g.clave === clave)?.valor ?? null;
  const max = Math.max(...claves.flatMap(k => BANCOS.map(b => valorDe(b.lado, k) || 0)), 1);
  const leyenda = BANCOS.map(b => `<span class="detail-legend-item"><span class="detail-legend-swatch" style="--bar-color:${b.color};"></span>${b.nombre}</span>`).join('');
  return `
    <div class="detail-legend" aria-label="Leyenda">${leyenda}</div>
    <div class="detail-chart-scroll"><div class="detail-chart">
      ${claves.map(k => `
        <div class="detail-bar-wrap">
          <div class="detail-bar-pair">
            ${BANCOS.map(b => {
              const v = valorDe(b.lado, k);
              const texto = `${b.nombre}: ${v === null ? 'sin lectura' : `${formatoNumeroDashboard(v)} ${unidad}`}`;
              return `<div class="detail-bar detail-bar-paired ${v === null ? 'detail-bar-empty' : ''}" style="--bar-height:${v === null ? 0 : Math.max(3, (v / max) * 100)}%; --bar-color:${b.color};" title="${escapar(texto)}" aria-label="${escapar(texto)}"></div>`;
            }).join('')}
          </div>
          <span class="detail-bar-label">${escapar(etiquetaGrupoConsumo(k, modo))}</span>
        </div>`).join('')}
    </div></div>`;
}

/* Detalle del oxígeno y del aire instrumental: cada banco por separado y el total de ambos */
function abrirDetalleBancos(campoId, tituloCodificado, unidad, modo) {
  const titulo = decodeURIComponent(tituloCodificado);
  const idsPeriodo = new Set(registrosPeriodoDashboard().map(r => r.id));
  // Se compara con la lectura anterior aunque esté fuera del período
  const series = extraerSeriesBancos(leerRegistros(), campoId);
  BANCOS.forEach(b => { series[b.lado] = series[b.lado].filter(x => idsPeriodo.has(x.registro.id)); });
  const porInforme = unirSeriesBancos(series);
  const gruposPorBanco = Object.fromEntries(BANCOS.map(b => [b.lado, agruparSerieDashboard(series[b.lado], modo)]));
  const esMensual = modo === 'mensual';
  const conUnidad = v => `${v} <span class="value-unit">${unidad}</span>`;
  const total = serie => serie.reduce((a, x) => a + x.valor, 0);
  const numero = v => formatoNumeroDashboard(v);

  const celdaBanco = x => x
    ? `<strong>${numero(x.valor)} ${unidad}</strong><br><small class="text-muted-em">${numero(x.lecturaAnterior)} → ${numero(x.lecturaActual)}</small>`
    : '<span class="text-muted-em">—</span>';

  let filas;
  if (esMensual) {
    const claves = [...new Set(BANCOS.flatMap(b => gruposPorBanco[b.lado].map(g => g.clave)))].sort().reverse();
    const valor = (lado, clave) => gruposPorBanco[lado].find(g => g.clave === clave)?.valor || 0;
    const informes = clave => porInforme.filter(x => agruparSerieDashboard([x], 'mensual')[0].clave === clave).length;
    filas = claves.map(k => `<tr><td><strong>${escapar(etiquetaGrupoConsumo(k, 'mensual'))}</strong></td>${BANCOS.map(b => `<td>${numero(valor(b.lado, k))} ${unidad}</td>`).join('')}<td><strong>${numero(valor('izquierdo', k) + valor('derecho', k))} ${unidad}</strong></td><td>${informes(k)}</td></tr>`).join('');
  } else {
    filas = porInforme.slice().reverse().map(x => `<tr><td>${escapar(formatearFechaCompleta(x.fecha))}</td><td>${escapar(x.registro.inspector || 'Técnico')}</td>${BANCOS.map(b => `<td>${celdaBanco(x[b.lado])}</td>`).join('')}<td><strong>${numero(x.valor)} ${unidad}</strong></td><td>${botonInforme(x.registro.id, 'secondary')}</td></tr>`).join('');
  }

  const pestana = (valor, texto) => `<button type="button" class="detail-tab ${modo === valor ? 'active' : ''}" data-action="open-usage-detail" data-field="${campoId}" data-title="${tituloCodificado}" data-unit="${escapar(unidad)}" data-color="" data-mode="${valor}">${texto}</button>`;
  const encabezados = esMensual
    ? '<th>Mes</th><th>Banco izquierdo</th><th>Banco derecho</th><th>Total</th><th>Informes</th>'
    : '<th>Fecha</th><th>Técnico</th><th>Banco izquierdo<br><small>consumo · lectura</small></th><th>Banco derecho<br><small>consumo · lectura</small></th><th>Total</th><th>Origen</th>';
  const totalAmbos = total(porInforme);

  abrirModalDashboard(titulo, `
    ${barraHerramientas(escapar(titulo), textoPeriodo(), `<div class="detail-tabs">${pestana('diario', 'Diario')}${pestana('mensual', 'Mensual')}</div>`)}
    <div class="detail-summary-grid">
      ${tarjetaResumen('Banco izquierdo · total', conUnidad(series.izquierdo.length ? numero(total(series.izquierdo)) : '—'))}
      ${tarjetaResumen('Banco derecho · total', conUnidad(series.derecho.length ? numero(total(series.derecho)) : '—'))}
      ${tarjetaResumen('Ambos bancos · total', conUnidad(porInforme.length ? numero(totalAmbos) : '—'))}
      ${tarjetaResumen('Promedio por informe (ambos)', conUnidad(porInforme.length ? numero(totalAmbos / porInforme.length) : '—'))}
    </div>
    <section class="detail-chart-card">
      <div class="detail-chart-head">
        <div><h4>${esMensual ? 'Comportamiento mensual por banco' : 'Comportamiento diario por banco'}</h4><span>${esMensual ? 'Reducción de presión agrupada por mes' : 'Reducción de presión agrupada por día'}</span></div>
        <span>Pase el cursor sobre una barra para ver su valor</span>
      </div>
      ${renderGraficaBancos(gruposPorBanco, unidad, modo)}
    </section>
    ${tablaDashboard(esMensual ? 'Resumen mensual' : 'Registros diarios', `${porInforme.length} registro(s)`,
      filas ? tabla(encabezados, filas) : '<div class="dashboard-empty">No existen datos registrados.</div>')}`);
}

export function abrirDetalleConsumo(campoId, tituloCodificado, unidad, color, modo = 'diario') {
  if (tieneBancos(campoId)) return abrirDetalleBancos(campoId, tituloCodificado, unidad, modo);
  const titulo = decodeURIComponent(tituloCodificado);
  const registrosPeriodo = registrosPeriodoDashboard();
  const esEstimado = campoId.startsWith('__');
  const idsPeriodo = new Set(registrosPeriodo.map(r => r.id));
  const serie = extraerSerieConsumo(esEstimado ? leerRegistros() : registrosPeriodo, campoId).filter(x => !esEstimado || idsPeriodo.has(x.registro.id));
  const grupos = agruparSerieDashboard(serie, modo);
  const r = resumenSerie(serie);
  const valores = serie.map(x => x.valor);
  const maximo = valores.length ? Math.max(...valores) : null;
  const minimo = valores.length ? Math.min(...valores) : null;
  const esMensual = modo === 'mensual';
  const conUnidad = v => `${v} <span class="value-unit">${unidad}</span>`;
  // Diésel en fracciones de tanque (1/4, 1/2…); los demás consumos en números
  const formato = v => formatoConsumo(v, campoId);
  const diesel = esConsumoDiesel(campoId);
  const lectura = x => `${escapar(formatoNivelTanque(x.lecturaAnterior))} → ${escapar(formatoNivelTanque(x.lecturaActual))}`;

  const filas = esMensual
    ? grupos.slice().reverse().map(g => `<tr><td><strong>${escapar(etiquetaGrupoConsumo(g.clave, 'mensual'))}</strong></td><td>${escapar(formato(g.valor))} ${unidad}</td><td>${escapar(formato(g.valor / g.cantidad))} ${unidad}</td><td>${g.cantidad}</td></tr>`).join('')
    : serie.slice().reverse().map(x => `<tr><td>${escapar(formatearFechaCompleta(x.fecha))}</td><td>${escapar(x.registro.inspector || 'Técnico')}</td>${diesel ? `<td>${lectura(x)}</td>` : ''}<td><strong>${escapar(formato(x.valor))} ${unidad}</strong></td><td>${botonInforme(x.registro.id, 'secondary')}</td></tr>`).join('');

  const pestana = (valor, texto) => `<button type="button" class="detail-tab ${modo === valor ? 'active' : ''}" data-action="open-usage-detail" data-field="${campoId}" data-title="${tituloCodificado}" data-unit="${escapar(unidad)}" data-color="${color}" data-mode="${valor}">${texto}</button>`;
  const encabezados = esMensual
    ? '<th>Mes</th><th>Total</th><th>Promedio</th><th>Días registrados</th>'
    : `<th>Fecha</th><th>Técnico</th>${diesel ? '<th>Nivel del tanque</th>' : ''}<th>Consumo</th><th>Origen</th>`;

  abrirModalDashboard(titulo, `
    ${barraHerramientas(escapar(titulo), textoPeriodo(), `<div class="detail-tabs">${pestana('diario', 'Diario')}${pestana('mensual', 'Mensual')}</div>`)}
    <div class="detail-summary-grid">
      ${tarjetaResumen('Total del período', conUnidad(serie.length ? escapar(formato(r.total)) : '—'))}
      ${tarjetaResumen('Promedio por registro', conUnidad(serie.length ? escapar(formato(r.promedio)) : '—'))}
      ${tarjetaResumen('Máximo diario registrado', conUnidad(maximo === null ? '—' : escapar(formato(maximo))))}
      ${tarjetaResumen('Mínimo diario registrado', conUnidad(minimo === null ? '—' : escapar(formato(minimo))))}
    </div>
    <section class="detail-chart-card">
      <div class="detail-chart-head">
        <div><h4>${esMensual ? 'Comportamiento mensual' : 'Comportamiento diario'}</h4><span>${esMensual ? 'Totales agrupados por mes' : 'Valores agrupados por día'}</span></div>
        <span>Línea roja = promedio del gráfico</span>
      </div>
      ${renderGraficaDetalleConsumo(grupos, unidad, color, modo, formato)}
    </section>
    ${tablaDashboard(esMensual ? 'Resumen mensual' : 'Registros diarios', `${serie.length} registro(s)`,
      filas ? tabla(encabezados, filas) : '<div class="dashboard-empty">No existen datos registrados.</div>')}`);
}

/* No conformidades */
export function abrirDetalleNoConformidades() {
  const hallazgos = obtenerDetalleNoConformidades();
  const sistemas = new Set(hallazgos.map(x => x.sistema)).size;
  const tecnicos = new Set(hallazgos.map(x => x.registro.inspector || 'Sin técnico')).size;
  const filas = hallazgos.map(x => {
    const r = x.registro;
    return `<tr>
      <td><strong>${escapar(formatearFechaCompleta(r.fechaISO || r.horaInicioISO))}</strong></td>
      <td>${escapar(r.inspector || 'Técnico')}</td>
      <td><strong>${escapar(x.sistema)}</strong></td>
      <td>${escapar(x.campo)}</td>
      <td><div class="cell-note-danger">${x.detalle ? escapar(x.detalle) : '<em class="text-muted-em">Sin descripción adicional</em>'}</div></td>
      <td>${botonInforme(r.id)}</td>
    </tr>`;
  }).join('');

  abrirModalDashboard('No conformidades reportadas', `
    ${barraHerramientas('Hallazgos de los técnicos', `${escapar(textoPeriodo())} · cada registro conserva su informe de origen.`)}
    <div class="detail-summary-grid">
      ${tarjetaResumen('No conformidades', hallazgos.length)}
      ${tarjetaResumen('Sistemas afectados', sistemas)}
      ${tarjetaResumen('Técnicos con hallazgos', tecnicos)}
      ${tarjetaResumen('Estado', hallazgos.length ? 'Requiere revisión' : 'Sin hallazgos', 'detail-summary-value-md')}
    </div>
    ${tablaDashboard('Detalle de lo reportado como “No conforme”', `${hallazgos.length} hallazgo(s)`, filas
      ? tabla('<th>Fecha</th><th>Técnico</th><th>Sistema</th><th>Elemento inspeccionado</th><th>Descripción del problema</th><th>Origen</th>', filas)
      : '<div class="dashboard-empty"><div><strong>Sin no conformidades</strong><br>No hay elementos marcados como “No conforme” en el período seleccionado.</div></div>')}`);
}

/* Duración de recorridos */
export function abrirDetalleDuracion(tecnicoCodificado = '') {
  const todosRegistros = registrosPeriodoDashboard().filter(r => Number.isFinite(Number(r.duracionSegundos)));
  const tecnicos = [...new Set(todosRegistros.map(r => r.inspector || 'Técnico'))].sort((a, b) => a.localeCompare(b, 'es'));
  const tecnicoSeleccionado = tecnicoCodificado ? decodeURIComponent(tecnicoCodificado) : '';
  const registros = tecnicoSeleccionado ? todosRegistros.filter(r => (r.inspector || 'Técnico') === tecnicoSeleccionado) : todosRegistros;
  const vals = registros.map(r => Number(r.duracionSegundos));
  const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  const filas = [...registros]
    .sort((a, b) => new Date(b.fechaISO || b.horaInicioISO) - new Date(a.fechaISO || a.horaInicioISO))
    .map(r => `<tr>
      <td><strong>${escapar(formatearFechaCompleta(r.fechaISO || r.horaInicioISO))}</strong></td><td>${escapar(r.inspector || 'Técnico')}</td>
      <td>${escapar(formatearHoraExacta(r.horaInicioISO))}</td><td>${escapar(r.horaFinISO ? formatearHoraExacta(r.horaFinISO) : '—')}</td>
      <td><strong>${formatearSegundos(Number(r.duracionSegundos) || 0)}</strong></td><td>${botonInforme(r.id)}</td>
    </tr>`).join('');

  const filtro = `
    <div class="form-field detail-filter">
      <label for="filtroTecnicoDuracion">Filtrar por técnico</label>
      <select id="filtroTecnicoDuracion" data-change="filter-duration">
        <option value="">Todos los técnicos</option>
        ${tecnicos.map(nombre => `<option value="${escapar(encodeURIComponent(nombre))}" ${nombre === tecnicoSeleccionado ? 'selected' : ''}>${escapar(nombre)}</option>`).join('')}
      </select>
    </div>`;

  abrirModalDashboard('Duración de los recorridos', `
    ${barraHerramientas('Análisis de duración por técnico', 'Seleccione un técnico para recalcular todos los indicadores y recorridos mostrados.', filtro)}
    <div class="detail-summary-grid">
      ${tarjetaResumen('Promedio', vals.length ? formatearSegundos(prom) : '—', 'detail-summary-value-md')}
      ${tarjetaResumen('Más rápido', vals.length ? formatearSegundos(min) : '—', 'detail-summary-value-md')}
      ${tarjetaResumen('Más extenso', vals.length ? formatearSegundos(max) : '—', 'detail-summary-value-md')}
      ${tarjetaResumen('Recorridos', vals.length)}
    </div>
    ${tablaDashboard(`Tiempo de cada recorrido${tecnicoSeleccionado ? ` · ${escapar(tecnicoSeleccionado)}` : ''}`, `${vals.length} recorrido(s)`, filas
      ? tabla('<th>Fecha</th><th>Técnico</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Origen</th>', filas)
      : '<div class="dashboard-empty">No existen recorridos con duración registrada para este técnico en el período seleccionado.</div>')}`);
}

/* Informes devueltos pendientes de subsanar */
export function abrirDetallePendientesSubsanar() {
  const pendientes = registrosPeriodoDashboard()
    .filter(r => r.estadoRevision === 'Con observaciones')
    .sort((a, b) => new Date(b.fechaISO || b.horaInicioISO) - new Date(a.fechaISO || a.horaInicioISO));
  const filas = pendientes.map(r => `<tr>
    <td><strong>${escapar(formatearFechaCompleta(r.fechaISO || r.horaInicioISO))}</strong></td><td>${escapar(r.inspector || 'Técnico')}</td>
    <td><div class="cell-note-warning">${r.observacionesIngeniero ? escapar(r.observacionesIngeniero) : '<em class="text-muted-em">Sin texto de observación</em>'}</div></td>
    <td><span class="tag tag-red">Pendiente de subsanar</span></td><td>${botonInforme(r.id)}</td>
  </tr>`).join('');

  abrirModalDashboard('Pendientes de subsanar', `
    ${barraHerramientas('Informes devueltos con observaciones', 'El ingeniero puede identificar al técnico, leer la observación pendiente y abrir el informe completo.')}
    <div class="detail-summary-grid">
      ${tarjetaResumen('Pendientes', pendientes.length)}
      ${tarjetaResumen('Técnicos involucrados', new Set(pendientes.map(r => r.inspector)).size)}
    </div>
    ${tablaDashboard('Observaciones que requieren respuesta', `${pendientes.length} pendiente(s)`, filas
      ? tabla('<th>Fecha</th><th>Técnico</th><th>Observación del ingeniero</th><th>Estado</th><th>Origen</th>', filas)
      : '<div class="dashboard-empty"><div><strong>Todo al día</strong><br>No existen informes devueltos con observaciones pendientes en este período.</div></div>')}`);
}

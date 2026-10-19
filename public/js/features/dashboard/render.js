/* Pantalla principal del dashboard de Ingeniería. */
import { $, escapar } from '../../core/dom.js';
import { estado } from '../../core/state.js';
import { formatearSegundos } from '../../core/format.js';
import { puedeSupervisar } from '../../core/roles.js';
import { leerRegistros } from '../../data/storage.js';
import { icono as iconoSvg } from '../../ui/icons.js';
import {
  registrosPeriodoDashboard, textoPeriodo, extraerSerieConsumo, resumenSerie, formatoNumeroDashboard, formatoConsumo, tieneBancos,
  etiquetaFechaDashboard, calcularNoConformidades, calcularRankingFallas, calcularCumplimiento, promedioDuracion
} from './calculations.js';

const PERIODOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
  { dias: 0, texto: 'Histórico' }
];

/* Indicadores de consumo: campo, título del detalle, unidad, color de la gráfica
   y tipo (define la clase indicator-<tipo> y su color en css/components/indicator.css) */
const CONSUMOS = [
  { campo: 'consumoDiarioAgua', titulo: 'Consumo de agua', etiqueta: 'Consumo de agua', icono: 'gota', unidad: 'm³', unidadKpi: 'm³', color: '#0284c7', tipo: 'water', enlace: 'Analizar consumo diario y mensual' },
  { campo: '__dieselGenEstimado', titulo: 'Diésel estimado · Generador eléctrico', etiqueta: 'Diésel · Generador', icono: 'engranaje', unidad: 'de tanque', unidadKpi: 'de tanque', color: '#ea580c', tipo: 'diesel-generator', sub: 'Consumo estimado por reducción del nivel' },
  { campo: '__dieselIncendiosEstimado', titulo: 'Diésel estimado · Supresión Contra Incendios', etiqueta: 'Diésel · Contra incendios', icono: 'llama', unidad: 'de tanque', unidadKpi: 'de tanque', color: '#b91c1c', tipo: 'diesel-fire', sub: 'Consumo estimado por reducción del nivel' },
  { campo: '__oxigenoEstimado', titulo: 'Consumo estimado de oxígeno · Banco de gases', etiqueta: 'Oxígeno · Reducción', icono: 'manifoldOxigeno', unidad: 'PSI', unidadKpi: 'PSI', color: '#16a34a', tipo: 'oxygen', sub: 'Reducción combinada de ambos bancos' },
  { campo: '__aireInstrumentalEstimado', titulo: 'Consumo estimado · Aire instrumental', etiqueta: 'Aire instrumental', icono: 'manifoldAire', unidad: 'PSI', unidadKpi: 'PSI', color: '#c24141', tipo: 'instrument-air', sub: 'Reducción combinada de ambos bancos' }
];

/* Luz de estado del indicador: ok (verde), warning (amarillo), alert (rojo), idle (gris) */
const luz = (clave, texto) => ({ clave, texto });

export function cambiarPeriodoDashboard(dias) {
  estado.periodoDashboardDias = dias;
  renderDashboardIngenieria();
}

/* Gráfica de barras compacta (disponible para tarjetas futuras) */
export function graficaBarrasDashboard(serie, unidad, color) {
  if (!serie.length) return '<div class="dashboard-empty"><div><strong>Sin datos todavía</strong><br>Los valores aparecerán cuando los técnicos registren este consumo en sus inspecciones.</div></div>';
  const datos = serie.slice(-12);
  const max = Math.max(...datos.map(x => x.valor), 1);
  return `<div class="mini-chart">${datos.map(x => {
    const h = Math.max(3, (x.valor / max) * 100);
    return `<div class="mini-bar-wrap"><div class="mini-bar" style="--bar-height:${h}%; --bar-color:${color};" data-tip="${escapar(formatoNumeroDashboard(x.valor))} ${unidad}"></div><span class="mini-label">${escapar(etiquetaFechaDashboard(x.fecha))}</span></div>`;
  }).join('')}</div>`;
}

/* Ranking de fallas por sistema (disponible para tarjetas futuras) */
export function renderRanking(ranking) {
  if (!ranking.length) return '<div class="dashboard-empty dashboard-empty-sm">No hay fallas registradas en el período.</div>';
  const max = Math.max(...ranking.map(x => x.cantidad), 1);
  return ranking.slice(0, 6).map((x, i) => `
    <div class="ranking-item clickable" role="button" tabindex="0" data-action="open-failures-detail" data-system="${encodeURIComponent(x.nombre)}">
      <div class="ranking-name">${i + 1}. ${escapar(x.nombre)}</div>
      <div class="ranking-track"><div class="ranking-fill" style="--fill:${Math.max(5, (x.cantidad / max) * 100)}%"></div></div>
      <div class="ranking-count">${x.cantidad}</div>
    </div>`).join('');
}

/* Tarjeta de indicador: título, valor, estado, detalle y acción.
   tipo     → clase indicator-<tipo> (color del icono)
   lectura  → valor principal; lecturaTexto=true para textos largos (nombre de un sistema)
   medidor  → porcentaje 0-100 para la barra de progreso (opcional) */
function tarjetaIndicador({ tipo, icono, titulo, lectura, unidad = '', lecturaTexto = false, medidor = null, estadoLuz, detalle, accion = '', datos = '', enlace = '' }) {
  const interactiva = Boolean(accion);
  const atributos = interactiva ? `role="button" tabindex="0" data-action="${accion}" ${datos}` : '';
  return `
    <article class="indicator indicator-${tipo} ${interactiva ? 'indicator-interactive' : ''}" ${atributos}>
      <header class="indicator-header">
        <h4 class="indicator-title">${titulo}</h4>
        <span class="indicator-icon">${iconoSvg(icono)}</span>
      </header>
      <p class="indicator-reading ${lecturaTexto ? 'indicator-reading-text' : ''}">
        <span class="indicator-value">${lectura}</span>${unidad ? `<span class="indicator-unit">${unidad}</span>` : ''}
      </p>
      ${medidor === null ? '' : `<div class="indicator-meter status-${estadoLuz.clave}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(medidor)}" aria-label="${titulo}"><span style="--fill:${Math.min(100, Math.max(0, medidor))}%"></span></div>`}
      <p class="indicator-meta">
        <span class="indicator-status status-${estadoLuz.clave}"><span class="indicator-led" aria-hidden="true"></span>${estadoLuz.texto}</span>
        <span class="indicator-detail">${detalle}</span>
      </p>
      ${interactiva && enlace ? `<footer class="indicator-action"><span>${enlace}</span>${iconoSvg('flechaDerecha')}</footer>` : ''}
    </article>`;
}

function indicadorConsumo(c, serie) {
  const r = resumenSerie(serie);
  // Oxígeno y aire instrumental: total de cada banco además del total de ambos
  const porBanco = tieneBancos(c.campo)
    ? ['izquierdo', 'derecho'].map(lado => serie.reduce((a, x) => a + (x[lado]?.valor || 0), 0))
    : null;
  const detalle = porBanco
    ? `Izq. ${formatoNumeroDashboard(porBanco[0])} ${c.unidad} · Der. ${formatoNumeroDashboard(porBanco[1])} ${c.unidad} · ${r.registros} comparación(es)`
    : c.sub
      ? `${c.sub} · ${r.registros} comparación(es)`
      : `${r.registros} registro(s) · Promedio ${serie.length ? formatoNumeroDashboard(r.promedio) : '—'} m³`;
  return tarjetaIndicador({
    tipo: c.tipo,
    icono: c.icono,
    titulo: c.etiqueta,
    lectura: serie.length ? formatoConsumo(r.total, c.campo) : '—',
    unidad: c.unidadKpi,
    estadoLuz: serie.length ? luz('ok', 'Con lecturas') : luz('idle', 'Sin lecturas'),
    detalle,
    accion: 'open-usage-detail',
    datos: `data-field="${c.campo}" data-title="${encodeURIComponent(c.titulo)}" data-unit="${c.unidad}" data-color="${c.color}" data-mode="diario"`,
    enlace: c.enlace || 'Analizar estimación'
  });
}

/* Luz del cumplimiento según el porcentaje de recorridos realizados */
function luzCumplimiento(c) {
  if (!c.programadas) return luz('idle', 'Sin programación');
  if (c.porcentaje >= 90) return luz('ok', 'En meta');
  if (c.porcentaje >= 60) return luz('warning', 'Bajo meta');
  return luz('alert', 'Crítico');
}

export function renderDashboardIngenieria() {
  const div = $('dashboardContenido');
  if (!div) return;
  if (!estado.usuarioSesion || !puedeSupervisar(estado.usuarioSesion.rol)) {
    div.innerHTML = '<div class="alert alert-error">Acceso exclusivo para Ingeniería.</div>';
    return;
  }

  const registros = registrosPeriodoDashboard();
  const idsPeriodo = new Set(registros.map(r => r.id));
  const historialCompleto = leerRegistros();
  /* El agua se suma directo; los estimados comparan con la lectura anterior aunque esté fuera del período */
  const seriePorConsumo = c => c.campo.startsWith('__')
    ? extraerSerieConsumo(historialCompleto, c.campo).filter(x => idsPeriodo.has(x.registro.id))
    : extraerSerieConsumo(registros, c.campo);

  const nc = calcularNoConformidades(registros);
  const rankingFallas = calcularRankingFallas(registros);
  const cumplimiento = calcularCumplimiento(registros);
  const duracionProm = promedioDuracion(registros);
  const pendientes = registros.filter(r => r.estadoRevision === 'Con observaciones').length;
  const ncSistemas = Object.keys(nc.porSistema).length;
  const masFallas = rankingFallas[0];

  const indicadores = [
    tarjetaIndicador({
      tipo: 'nonconformities', icono: 'alerta', titulo: 'No conformidades',
      lectura: nc.total,
      estadoLuz: nc.total ? luz('alert', 'Atención') : luz('ok', 'Normal'),
      detalle: ncSistemas ? `${ncSistemas} sistema(s) con hallazgos` : 'Sin no conformidades en el período',
      accion: 'open-nonconformities-detail', enlace: 'Ver problemas reportados'
    }),
    tarjetaIndicador({
      tipo: 'failures', icono: 'herramienta', titulo: 'Sistema con más fallas',
      lectura: masFallas ? escapar(masFallas.nombre) : '0', lecturaTexto: Boolean(masFallas),
      estadoLuz: masFallas ? luz('alert', 'Revisar') : luz('ok', 'Sin fallas'),
      detalle: masFallas ? `${masFallas.cantidad} falla(s) reportada(s)` : 'No se reportaron fallas',
      accion: masFallas ? 'open-failures-detail' : '',
      datos: masFallas ? `data-system="${encodeURIComponent(masFallas.nombre)}"` : '',
      enlace: 'Ver fallas reportadas'
    }),
    tarjetaIndicador({
      tipo: 'compliance', icono: 'calendario', titulo: 'Cumplimiento',
      lectura: cumplimiento.programadas ? formatoNumeroDashboard(cumplimiento.porcentaje, 1) : '—',
      unidad: cumplimiento.programadas ? '%' : '',
      medidor: cumplimiento.programadas ? cumplimiento.porcentaje : null,
      estadoLuz: luzCumplimiento(cumplimiento),
      detalle: cumplimiento.programadas
        ? `${cumplimiento.realizadas} realizadas de ${cumplimiento.programadas} programadas · ${cumplimiento.noRealizadas} pendiente(s)`
        : 'No hay recorridos programados en el período',
      accion: 'open-compliance-detail',
      enlace: cumplimiento.programadas ? 'Ver quién realizó y quién no' : 'Ver detalle de programación'
    }),
    tarjetaIndicador({
      tipo: 'duration', icono: 'reloj', titulo: 'Duración promedio',
      lectura: registros.length ? formatearSegundos(duracionProm) : '—',
      estadoLuz: registros.length ? luz('ok', 'Registrado') : luz('idle', 'Sin datos'),
      detalle: `Promedio de ${registros.length} inspección(es)`,
      accion: 'open-duration-detail', enlace: 'Ver duración de cada recorrido'
    }),
    tarjetaIndicador({
      tipo: 'pending', icono: 'pin', titulo: 'Pendientes de subsanar',
      lectura: pendientes,
      estadoLuz: pendientes ? luz('warning', 'Pendiente') : luz('ok', 'Al día'),
      detalle: 'Reporte(s) devuelto(s) con observaciones',
      accion: 'open-pending-detail', enlace: 'Ver observaciones pendientes'
    })
  ];

  div.innerHTML = `
    <header class="dashboard-hero">
      <div><h2>Información general</h2><p>Indicadores de los recorridos de inspección y consumos de la Casa de Máquinas.</p></div>
      <div class="dashboard-filters" role="group" aria-label="Período">
        ${PERIODOS.map(p => `<button type="button" class="dashboard-filter ${estado.periodoDashboardDias === p.dias ? 'active' : ''}" data-action="set-dashboard-period" data-days="${p.dias}">${p.texto}</button>`).join('')}
      </div>
    </header>

    <section aria-labelledby="tituloIndicadoresGestion">
      <div class="dashboard-section-title"><div><h3 id="tituloIndicadoresGestion">Indicadores de gestión</h3><p>${textoPeriodo()}</p></div></div>
      <div class="indicator-grid">${indicadores.join('')}</div>
    </section>

    <section aria-labelledby="tituloConsumosOperativos">
      <div class="dashboard-section-title"><div><h3 id="tituloConsumosOperativos">Consumos operativos</h3><p>Agua registrada directamente; diésel y gases estimados mediante la reducción entre lecturas consecutivas.</p></div></div>
      <div class="indicator-grid">${CONSUMOS.map(c => indicadorConsumo(c, seriePorConsumo(c))).join('')}</div>
    </section>`;
}

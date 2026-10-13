/* Cálculos del dashboard: series de consumo, no conformidades, fallas, cumplimiento y duración.
   No toca el DOM; solo transforma datos. */
import { estado } from '../../core/state.js';
import { fechaLocalISO } from '../../core/format.js';
import { SISTEMAS } from '../../data/systems.js';
import { leerRegistros, leerCronograma } from '../../data/storage.js';

export function numeroConsumo(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'object') return null;
  const limpio = String(valor).trim().replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function textoPeriodo(sufijoTodo = 'Todo el historial') {
  return estado.periodoDashboardDias ? `Últimos ${estado.periodoDashboardDias} días` : sufijoTodo;
}

export function registrosPeriodoDashboard() {
  const registros = leerRegistros();
  if (!estado.periodoDashboardDias) return registros;
  const limite = new Date();
  limite.setHours(0, 0, 0, 0);
  limite.setDate(limite.getDate() - (estado.periodoDashboardDias - 1));
  return registros.filter(r => {
    const f = new Date(r.fechaISO || r.horaInicioISO);
    return !Number.isNaN(f.getTime()) && f >= limite;
  });
}

/* Series de consumo */
function convertirNivelDiesel(valor) {
  const texto = String(valor ?? '').trim().toLowerCase().replace(',', '.');
  if (!texto) return null;
  if (/^(lleno|full|completo)$/.test(texto)) return 1;
  const fraccion = texto.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraccion) {
    const numerador = Number(fraccion[1]);
    const denominador = Number(fraccion[2]);
    return denominador > 0 && numerador >= 0 && numerador <= denominador ? numerador / denominador : null;
  }
  const porcentaje = texto.match(/(\d+(?:\.\d+)?)\s*%/);
  if (porcentaje) {
    const n = Number(porcentaje[1]);
    return n >= 0 && n <= 100 ? n / 100 : null;
  }
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function construirSerieReduccion(registros, obtenerLectura, factor = 1) {
  const lecturas = registros
    .map(r => ({ registro: r, fecha: new Date(r.fechaISO || r.horaInicioISO), lectura: obtenerLectura(r) }))
    .filter(x => x.lectura !== null && Number.isFinite(x.lectura) && !Number.isNaN(x.fecha.getTime()))
    .sort((a, b) => a.fecha - b.fecha);
  const serie = [];
  for (let i = 1; i < lecturas.length; i++) {
    const anterior = lecturas[i - 1];
    const actual = lecturas[i];
    const diferencia = anterior.lectura - actual.lectura;
    if (diferencia < 0) continue;
    serie.push({ registro: actual.registro, fecha: actual.fecha, valor: diferencia * factor, lecturaAnterior: anterior.lectura, lecturaActual: actual.lectura });
  }
  return serie;
}

function extraerSerieReduccionDiesel(registros, campoNivel) {
  return construirSerieReduccion(registros, r => convertirNivelDiesel(r.datos ? r.datos[campoNivel] : null), 100);
}

function extraerSerieReduccionPresiones(registros, campoIzquierdo, campoDerecho) {
  return construirSerieReduccion(registros, r => {
    const izquierda = numeroConsumo(r.datos ? r.datos[campoIzquierdo] : null);
    const derecha = numeroConsumo(r.datos ? r.datos[campoDerecho] : null);
    return izquierda === null || derecha === null ? null : izquierda + derecha;
  });
}

/* Los ids que empiezan con "__" son consumos estimados a partir de lecturas consecutivas */
export function extraerSerieConsumo(registros, campoId) {
  if (campoId === '__dieselGenEstimado') return extraerSerieReduccionDiesel(registros, 'nivelDieselGen');
  if (campoId === '__dieselIncendiosEstimado') return extraerSerieReduccionDiesel(registros, 'nivelDiesel');
  if (campoId === '__oxigenoEstimado') return extraerSerieReduccionPresiones(registros, 'presionBancoIzqO2', 'presionBancoDerO2');
  if (campoId === '__aireInstrumentalEstimado') return extraerSerieReduccionPresiones(registros, 'presionBancoIzqInstr', 'presionBancoDerInstr');
  return registros
    .map(r => ({ registro: r, fecha: new Date(r.fechaISO || r.horaInicioISO), valor: numeroConsumo(r.datos ? r.datos[campoId] : null) }))
    .filter(x => x.valor !== null && !Number.isNaN(x.fecha.getTime()))
    .sort((a, b) => a.fecha - b.fecha);
}

export function resumenSerie(serie) {
  if (!serie.length) return { total: 0, promedio: 0, ultimo: null, registros: 0 };
  const total = serie.reduce((a, x) => a + x.valor, 0);
  return { total, promedio: total / serie.length, ultimo: serie[serie.length - 1], registros: serie.length };
}

export function agruparSerieDashboard(serie, modo = 'diario') {
  const grupos = new Map();
  serie.forEach(x => {
    const f = x.fecha;
    const clave = modo === 'mensual' ? `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}` : fechaLocalISO(f);
    if (!grupos.has(clave)) grupos.set(clave, { clave, valor: 0, cantidad: 0, registros: [] });
    const g = grupos.get(clave);
    g.valor += x.valor;
    g.cantidad++;
    g.registros.push(x);
  });
  return [...grupos.values()].sort((a, b) => a.clave.localeCompare(b.clave));
}

/* Formato */
export function formatoNumeroDashboard(n, max = 2) {
  return Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: max });
}

export function etiquetaFechaDashboard(fecha) {
  return fecha.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function etiquetaGrupoConsumo(clave, modo) {
  if (modo === 'mensual') {
    const [y, m] = clave.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CR', { month: 'short', year: 'numeric' }).replace('.', '');
  }
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }).replace('.', '');
}

/* Mapa campoId → sistema */
export function obtenerMapaCamposSistema() {
  const mapa = {};
  SISTEMAS.forEach(s => s.paneles.forEach(p => (p.campos || []).forEach(c => {
    mapa[c.id] = { sistemaId: s.id, sistema: s.nombre, campo: c };
  })));
  return mapa;
}

/* No conformidades */
export function calcularNoConformidades(registros) {
  const mapa = obtenerMapaCamposSistema();
  const porSistema = {}, porTecnico = {};
  let total = 0;
  registros.forEach(r => {
    Object.entries(r.datos || {}).forEach(([id, valor]) => {
      if (valor && typeof valor === 'object' && valor.estado === 'No conforme') {
        total++;
        const sist = mapa[id]?.sistema || 'Otros';
        porSistema[sist] = (porSistema[sist] || 0) + 1;
        const tecnico = r.inspector || 'Sin técnico';
        porTecnico[tecnico] = (porTecnico[tecnico] || 0) + 1;
      }
    });
  });
  return { total, porSistema, porTecnico };
}

export function obtenerDetalleNoConformidades() {
  const mapa = obtenerMapaCamposSistema();
  const hallazgos = [];
  registrosPeriodoDashboard().forEach(r => {
    Object.entries(r.datos || {}).forEach(([id, valor]) => {
      if (!(valor && typeof valor === 'object' && valor.estado === 'No conforme')) return;
      const meta = mapa[id] || {};
      hallazgos.push({
        registro: r,
        sistema: meta.sistema || 'Otros',
        campo: (meta.campo && meta.campo.label) || id,
        detalle: String(valor.detalle || '').trim()
      });
    });
  });
  return hallazgos.sort((a, b) => new Date(b.registro.fechaISO || b.registro.horaInicioISO) - new Date(a.registro.fechaISO || a.registro.horaInicioISO));
}

/* Fallas reportadas en campos de historial de fallas */
function textoIndicaSinFalla(v) {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return true;
  return /sin\s+fall|ninguna\s+fall|no\s+(hay|registra|presenta).*fall|sin\s+evento|sin\s+alarma/.test(t);
}

function esFallaReportada(id, meta, valor) {
  if (!meta) return false;
  const esCampoFalla = /falla/i.test(id) || /falla/i.test(meta.campo.label || '');
  return esCampoFalla && typeof valor !== 'object' && !textoIndicaSinFalla(valor);
}

export function calcularRankingFallas(registros) {
  const mapa = obtenerMapaCamposSistema();
  const ranking = {};
  registros.forEach(r => {
    Object.entries(r.datos || {}).forEach(([id, valor]) => {
      const meta = mapa[id];
      if (!esFallaReportada(id, meta, valor)) return;
      ranking[meta.sistema] = (ranking[meta.sistema] || 0) + 1;
    });
  });
  return Object.entries(ranking).map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}

export function registrosFallasSistema(nombreSistema) {
  const mapa = obtenerMapaCamposSistema();
  const hallazgos = [];
  registrosPeriodoDashboard().forEach(r => {
    Object.entries(r.datos || {}).forEach(([id, valor]) => {
      const meta = mapa[id];
      if (!meta || meta.sistema !== nombreSistema || !esFallaReportada(id, meta, valor)) return;
      hallazgos.push({
        registro: r,
        fecha: new Date(r.fechaISO || r.horaInicioISO),
        campoId: id,
        campo: meta.campo.label || id,
        texto: String(valor || '').trim()
      });
    });
  });
  return hallazgos.sort((a, b) => b.fecha - a.fecha);
}

/* Cumplimiento del rol semanal */
export function calcularCumplimiento(registros) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let limite = null;
  if (estado.periodoDashboardDias) {
    limite = new Date(hoy);
    limite.setDate(limite.getDate() - (estado.periodoDashboardDias - 1));
  }

  const programados = new Map();
  leerCronograma().forEach(sem => {
    const f = new Date(sem.inicio + 'T00:00:00');
    const fin = new Date(sem.fin + 'T00:00:00');
    while (f <= fin && f <= hoy) {
      if (!limite || f >= limite) {
        const fecha = fechaLocalISO(f);
        const clave = `${fecha}|${sem.tecnico}`;
        if (!programados.has(clave)) {
          programados.set(clave, {
            clave,
            fecha,
            fechaObj: new Date(f),
            tecnico: sem.tecnico || 'Sin técnico asignado',
            semanaInicio: sem.inicio,
            semanaFin: sem.fin,
            notas: sem.notas || ''
          });
        }
      }
      f.setDate(f.getDate() + 1);
    }
  });

  const registrosPorClave = new Map();
  registros.forEach(r => {
    const f = new Date(r.fechaISO || r.horaInicioISO);
    if (Number.isNaN(f.getTime())) return;
    const clave = `${fechaLocalISO(f)}|${r.inspector || ''}`;
    if (!programados.has(clave)) return;
    const existente = registrosPorClave.get(clave);
    if (!existente || new Date(r.horaInicioISO || r.fechaISO) > new Date(existente.horaInicioISO || existente.fechaISO)) {
      registrosPorClave.set(clave, r);
    }
  });

  const detalle = [...programados.values()].map(item => {
    const registro = registrosPorClave.get(item.clave) || null;
    return { ...item, realizado: !!registro, registro };
  }).sort((a, b) => b.fechaObj - a.fechaObj || a.tecnico.localeCompare(b.tecnico));

  const realizadas = detalle.filter(x => x.realizado).length;
  const noRealizadas = detalle.length - realizadas;
  const porcentaje = detalle.length ? Math.min(100, (realizadas / detalle.length) * 100) : null;
  return { programadas: detalle.length, realizadas, noRealizadas, porcentaje, detalle };
}

/* Duración */
export function promedioDuracion(registros) {
  const vals = registros.map(r => Number(r.duracionSegundos)).filter(v => Number.isFinite(v) && v >= 0);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

/* Prueba de punta a punta del Dashboard: recorridos reales por la API durante varios días y el Dashboard
   generado con el código del navegador. Los valores esperados se calculan a mano en esta prueba (no con
   el código que se prueba). Ejecutar: npm test */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBaseDatos } from '../server/db/connection.js';
import { crearApp } from '../server/app.js';
import { SISTEMAS } from '../public/js/data/systems.js';

process.env.TZ = 'America/Costa_Rica';

/* ---- Navegador mínimo: el Dashboard solo escribe innerHTML en elementos por id ---- */
const elementos = new Map();
function elemento(id) {
  if (!elementos.has(id)) {
    const clases = new Set(['hidden']);
    elementos.set(id, {
      id, innerHTML: '', textContent: '',
      classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c), toggle: (c, v) => ((v ?? !clases.has(c)) ? clases.add(c) : clases.delete(c)) }
    });
  }
  return elementos.get(id);
}
globalThis.addEventListener = () => {};
globalThis.document = { getElementById: elemento, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };

let servidor, db, base, carpetaFotos, dashboard, detalles, estado;

/* Texto visible de un HTML (sin etiquetas ni íconos) */
const texto = html => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/* Tarjeta del Dashboard por su tipo (indicator-<tipo>) */
function tarjeta(tipo) {
  const html = elemento('dashboardContenido').innerHTML;
  const inicio = html.indexOf(`indicator indicator-${tipo}`);
  assert.ok(inicio >= 0, `existe la tarjeta ${tipo}`);
  const fin = html.indexOf('<article', inicio + 10);
  return texto(html.slice(inicio, fin < 0 ? undefined : fin));
}
const modal = () => texto(elemento('modalDashboardContenido').innerHTML);
// Como texto(): el separador de miles (espacio que no se corta) queda como espacio normal
const numero = n => n.toLocaleString('es-CR', { maximumFractionDigits: 2 }).replace(/\s/g, ' ');

/* Cliente con cookie propia */
function cliente() {
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const nueva = r.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    return { estado: r.status, datos: r.status === 204 ? null : await r.json().catch(() => null) };
  };
  return { pedir, cookie: () => cookie, login: u => pedir('POST', '/api/auth/login', { usuario: u, password: '123' }) };
}

/* ---- Datos: 6 días hábiles anteriores a hoy, recorridos de mañana y tarde ---- */
const local = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function diasHabilesAnteriores(n) {
  const dias = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (dias.length < n) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) dias.unshift(new Date(d));
  }
  return dias;
}
const DIAS = diasHabilesAnteriores(6);
const RONDAS = DIAS.flatMap(d => ['manana', 'tarde'].map(tipo => ({ dia: d, tipo })));

// Lecturas en orden cronológico (una por recorrido)
const DIESEL_INCENDIOS = ['lleno', 'lleno', '3/4', '3/4', '1/2', '1/2', '1/4', 'lleno', '3/4', '3/4', '1/2', '1/2'];
const DIESEL_GENERADOR = ['1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/2', '1/4'];
const AGUA = RONDAS.map((_, i) => String(10 + i)); // 10, 11, … 21 m³
const O2_IZQ = RONDAS.map((_, i) => String(2000 - i * 100));
const O2_DER = RONDAS.map((_, i) => String(1800 - i * 50));
const AIRE_IZQ = RONDAS.map(() => '120');
const AIRE_DER = RONDAS.map((_, i) => String(110 - i));
const DURACION = RONDAS.map((_, i) => 1800 + i * 60); // 30 min, 31 min, …
// Hallazgos
const NO_CONFORME = { 1: 'fugasIncendio', 4: 'fugasIncendio', 7: 'calentadorCamisas' };
const FALLAS = { 2: ['historialFallasGen', 'Falla de arranque'], 9: ['historialFallasGen', 'Batería baja'], 5: ['ultimaFallaMotor', 'Sobrecalentamiento'] };
const DEVUELTOS = [3, 10];
// Último día: la mañana la inicia Ronald (el asignado del rol) y la completa Carlos; la tarde la hace Carlos.
// Ese día cuenta como cumplido para Ronald porque participó en el recorrido.
const CONTINUADO = 10;
const SOLO_CARLOS = 11;

function datosDeRonda(i) {
  const datos = {};
  for (const s of SISTEMAS) for (const c of s.paneles.flatMap(p => p.campos)) {
    if (c.tipo === 'verificacion') datos[c.id] = NO_CONFORME[i] === c.id ? { estado: 'No conforme', detalle: 'Fuga de aceite' } : { estado: 'Conforme', detalle: '' };
    else datos[c.id] = c.tipo === 'textarea' ? 'Sin fallas registradas' : '10';
  }
  Object.assign(datos, {
    nivelDiesel: DIESEL_INCENDIOS[i], nivelDieselGen: DIESEL_GENERADOR[i], consumoDiarioAgua: AGUA[i],
    presionBancoIzqO2: O2_IZQ[i], presionBancoDerO2: O2_DER[i], presionBancoIzqInstr: AIRE_IZQ[i], presionBancoDerInstr: AIRE_DER[i]
  });
  if (FALLAS[i]) datos[FALLAS[i][0]] = FALLAS[i][1];
  return datos;
}

before(async () => {
  db = abrirBaseDatos(':memory:', { silencioso: true });
  carpetaFotos = fs.mkdtempSync(path.join(os.tmpdir(), 'sidem-e2e-'));
  servidor = crearApp(db, { carpetaFotos }).listen(0);
  await new Promise(r => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;

  const ronald = cliente(), carlos = cliente(), ingeniero = cliente();
  await ronald.login('rsalas');
  await carlos.login('cmurillo');
  await ingeniero.login('ingeniero');
  await ingeniero.pedir('PUT', '/api/ajustes', { permitirTomaRecorridos: true });

  // Rol semanal: Ronald asignado a las semanas (lunes a viernes) que cubren los días de la prueba
  db.exec('DELETE FROM semanas_rol');
  const lunes = [...new Set(DIAS.map(d => { const l = new Date(d); l.setDate(l.getDate() - ((l.getDay() + 6) % 7)); return local(l); }))];
  for (const inicio of lunes) assert.equal((await ingeniero.pedir('POST', '/api/cronograma', { inicio, tecnicoId: 'usr-2' })).estado, 201);

  // Cada recorrido se hace hoy por la API y luego se pasa a su día (la API solo admite el recorrido de hoy)
  for (const [i, ronda] of RONDAS.entries()) {
    const quienInicia = i === SOLO_CARLOS ? carlos : ronald;
    const quien = i === CONTINUADO || i === SOLO_CARLOS ? carlos : ronald;
    const inicio = await quienInicia.pedir('POST', '/api/progreso/iniciar', { tipoRecorrido: ronda.tipo });
    assert.equal(inicio.estado, 201, inicio.datos?.error);
    const recorridoId = inicio.datos.inspeccionActiva.id;
    if (i === CONTINUADO) {
      assert.equal((await carlos.pedir('POST', `/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'cmurillo', password: '123' })).estado, 200);
    }
    const enviado = await quien.pedir('POST', '/api/inspecciones', { recorridoId, datos: datosDeRonda(i), justificacionesSistemas: {}, ordenRecorrido: SISTEMAS.map(s => s.id) });
    assert.equal(enviado.estado, 201, enviado.datos?.error);
    const horaInicio = new Date(ronda.dia);
    horaInicio.setHours(ronda.tipo === 'manana' ? 8 : 14, 0, 0, 0);
    const horaFin = new Date(horaInicio.getTime() + DURACION[i] * 1000);
    db.prepare('UPDATE inspecciones SET fecha_local = ?, hora_inicio = ?, hora_fin = ?, duracion_segundos = ? WHERE id = ?')
      .run(local(ronda.dia), horaInicio.toISOString(), horaFin.toISOString(), DURACION[i], enviado.datos.id);
    RONDAS[i].id = enviado.datos.id;
  }
  for (const i of DEVUELTOS) {
    assert.equal((await ingeniero.pedir('PUT', `/api/inspecciones/${RONDAS[i].id}/revision`, { estadoRevision: 'Con observaciones', observaciones: `Revisar recorrido ${i}` })).estado, 200);
  }

  // El navegador del ingeniero: carga los datos con su sesión y genera el Dashboard
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (ruta, opciones = {}) => fetchReal(new URL(ruta, base), { ...opciones, headers: { ...(opciones.headers || {}), cookie: ingeniero.cookie() } });
  const { sincronizar } = await import('../public/js/data/storage.js');
  ({ estado } = await import('../public/js/core/state.js'));
  estado.usuarioSesion = await sincronizar();
  estado.periodoDashboardDias = 30;
  dashboard = await import('../public/js/features/dashboard/render.js');
  detalles = await import('../public/js/features/dashboard/details.js');
  dashboard.renderDashboardIngenieria();
});

after(() => {
  servidor.close();
  db.close();
  fs.rmSync(carpetaFotos, { recursive: true, force: true });
});

test('dashboard: no conformidades', () => {
  const t = tarjeta('nonconformities');
  assert.match(t, /No conformidades 3 /, '3 no conformidades');
  assert.match(t, /Atención/);
  assert.match(t, /2 sistema\(s\) con hallazgos/, 'incendios y generador');
  detalles.abrirDetalleNoConformidades();
  const m = modal();
  assert.equal((m.match(/Fuga de aceite/g) || []).length, 3, 'las 3 aparecen en el detalle con su descripción');
  assert.match(m, /Supresión Contra Incendios/);
  assert.match(m, /Generador Eléctrico/);
});

test('dashboard: sistema con más fallas', () => {
  const t = tarjeta('failures');
  assert.match(t, /Generador Eléctrico/, 'el generador tiene 2 fallas; incendios, 1');
  assert.match(t, /2 falla\(s\) reportada\(s\)/);
  detalles.abrirDetalleFallas(encodeURIComponent('Generador Eléctrico'));
  const m = modal();
  assert.match(m, /Falla de arranque/);
  assert.match(m, /Batería baja/);
});

test('dashboard: cumplimiento del rol semanal', () => {
  // Programados: días hábiles de las semanas del rol hasta hoy; realizados: los 6 días de la prueba
  const programados = new Set();
  const semanas = db.prepare('SELECT inicio, fin FROM semanas_rol').all();
  const hoy = local(new Date());
  for (const s of semanas) {
    for (let d = new Date(s.inicio + 'T12:00:00'); local(d) <= s.fin && local(d) <= hoy; d.setDate(d.getDate() + 1)) programados.add(local(d));
  }
  const realizados = new Set(DIAS.map(local));
  const porcentaje = (realizados.size / programados.size) * 100;
  const t = tarjeta('compliance');
  assert.match(t, new RegExp(`Cumplimiento ${numero(Math.round(porcentaje * 10) / 10).replace('.', '\\.')} %`), `${porcentaje.toFixed(1)} %`);
  assert.match(t, new RegExp(`${realizados.size} realizadas de ${programados.size} programadas`));
});

test('dashboard: duración promedio', () => {
  const promedio = Math.round(DURACION.reduce((a, b) => a + b, 0) / DURACION.length);
  const hms = [Math.floor(promedio / 3600), Math.floor((promedio % 3600) / 60), promedio % 60].map(n => String(n).padStart(2, '0')).join(':');
  const t = tarjeta('duration');
  assert.match(t, new RegExp(`Duración promedio ${hms}`), hms);
  assert.match(t, /Promedio de 12 inspección\(es\)/);
});

test('dashboard: pendientes de subsanar', () => {
  assert.match(tarjeta('pending'), /Pendientes de subsanar 2 /);
  detalles.abrirDetallePendientesSubsanar();
  const m = modal();
  for (const i of DEVUELTOS) assert.match(m, new RegExp(`Revisar recorrido ${i}`));
});

test('dashboard: consumo de agua', () => {
  const total = AGUA.reduce((a, v) => a + Number(v), 0); // 186 m³
  const t = tarjeta('water');
  assert.match(t, new RegExp(`Consumo de agua ${numero(total)} m³`));
  assert.match(t, new RegExp(`12 registro\\(s\\) · Promedio ${numero(total / 12).replace('.', '\\.')} m³`));
  detalles.abrirDetalleConsumo('consumoDiarioAgua', encodeURIComponent('Consumo de agua'), 'm³', '#0284c7');
  assert.match(modal(), new RegExp(`Total del período ${numero(total)} m³`));
});

test('dashboard: diésel en fracciones de tanque', () => {
  // Incendios: lleno→lleno 0, →3/4 ¼, 0, →1/2 ¼, 0, →1/4 ¼, recarga (no cuenta), →3/4 ¼, 0, →1/2 ¼, 0 = 1 ¼
  const incendios = tarjeta('diesel-fire');
  assert.match(incendios, /1 1\/4 de tanque/);
  assert.match(incendios, /10 comparación\(es\)/, '11 comparaciones menos la recarga');
  // Generador: solo baja en el último recorrido (1/2 → 1/4)
  assert.match(tarjeta('diesel-generator'), /1\/4 de tanque/);
  detalles.abrirDetalleConsumo('__dieselIncendiosEstimado', encodeURIComponent('Diésel incendios'), 'de tanque', '#b91c1c');
  const m = modal();
  assert.match(m, /lleno → 3\/4/);
  assert.doesNotMatch(m, /1\/4 → lleno/, 'la recarga no aparece como consumo');
});

test('dashboard: oxígeno y aire instrumental por banco', () => {
  // Oxígeno: el izquierdo baja 100 y el derecho 50 en cada una de las 11 comparaciones
  const o2 = tarjeta('oxygen');
  assert.match(o2, new RegExp(`${numero(1650)} PSI`));
  assert.match(o2, new RegExp(`Izq\\. ${numero(1100)} PSI · Der\\. ${numero(550)} PSI`));
  // Aire: el izquierdo no cambia; el derecho baja 1 PSI por comparación
  const aire = tarjeta('instrument-air');
  assert.match(aire, /11 PSI/);
  assert.match(aire, /Izq\. 0 PSI · Der\. 11 PSI/);
  detalles.abrirDetalleConsumo('__oxigenoEstimado', encodeURIComponent('Oxígeno'), 'PSI', '');
  const m = modal();
  assert.match(m, new RegExp(`Banco izquierdo · total ${numero(1100)} PSI`));
  assert.match(m, new RegExp(`Banco derecho · total ${numero(550)} PSI`));
  assert.equal((elemento('modalDashboardContenido').innerHTML.match(/detail-bar-paired/g) || []).length, DIAS.length * 2, 'dos barras por día');
});

test('dashboard: ningún indicador queda vacío con datos registrados', () => {
  const html = texto(elemento('dashboardContenido').innerHTML);
  assert.doesNotMatch(html, /Sin lecturas|Sin datos/, 'todas las tarjetas tienen información');
});

test('dashboard: detalle de cumplimiento y de duración', () => {
  detalles.abrirDetalleCumplimiento();
  const c = modal();
  assert.match(c, new RegExp(`Realizados ${DIAS.length}`));
  assert.equal((c.match(/ Realizado /g) || []).length, DIAS.length, 'un "Realizado" por cada día con recorrido');
  assert.match(c, /Ronald Salas Herrera/);

  detalles.abrirDetalleDuracion();
  const d = modal();
  const hms = s => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
  assert.match(d, new RegExp(`Más rápido ${hms(Math.min(...DURACION))}`));
  assert.match(d, new RegExp(`Más extenso ${hms(Math.max(...DURACION))}`));
  assert.match(d, new RegExp(`Recorridos ${RONDAS.length}`));
});

test('dashboard: los períodos de 7 días e histórico también se llenan', () => {
  estado.periodoDashboardDias = 0; // histórico
  dashboard.renderDashboardIngenieria();
  assert.match(tarjeta('duration'), /Promedio de 12 inspección\(es\)/);
  estado.periodoDashboardDias = 7;
  dashboard.renderDashboardIngenieria();
  // "Últimos 7 días" = hoy y los 6 días de calendario anteriores, desde la medianoche
  const limite = new Date();
  limite.setHours(0, 0, 0, 0);
  limite.setDate(limite.getDate() - 6);
  const enSieteDias = RONDAS.filter(r => r.dia >= limite).length;
  assert.ok(tarjeta('duration').includes(`Promedio de ${enSieteDias} inspección(es)`), `${enSieteDias} inspecciones en 7 días`);
  estado.periodoDashboardDias = 30;
});

test('formulario → informe: cada pregunta de los 13 sistemas llega al informe y se muestra en el detalle', async () => {
  const campos = SISTEMAS.flatMap(s => s.paneles.flatMap(p => p.campos).map(c => ({ ...c, sistema: s.nombre })));
  const informe = estado.usuarioSesion && (await import('../public/js/data/storage.js')).leerRegistros().find(r => r.id === RONDAS[0].id);
  assert.ok(informe, 'el informe está en los datos del ingeniero');

  const enviado = datosDeRonda(0);
  const faltan = campos.filter(c => JSON.stringify(informe.datos[c.id]) !== JSON.stringify(enviado[c.id]));
  assert.deepEqual(faltan.map(c => `${c.sistema} · ${c.label}`), [], 'ninguna respuesta se pierde al guardar');

  // El detalle del informe muestra cada pregunta con su respuesta
  const { verDetalle } = await import('../public/js/features/report-detail.js');
  verDetalle(informe.id);
  const html = elemento('detalleContenido').innerHTML;
  const sinMostrar = campos.filter(c => !html.includes(`id="reporte_campo_${c.id}"`));
  assert.deepEqual(sinMostrar.map(c => c.label), [], 'todas las preguntas aparecen en el detalle');
  const vacias = campos.filter(c => {
    const i = html.indexOf(`id="reporte_campo_${c.id}"`);
    const bloque = html.slice(i, html.indexOf('</div>', i));
    return />—</.test(bloque);
  });
  assert.deepEqual(vacias.map(c => c.label), [], 'ninguna respondida aparece como "—"');
  assert.match(texto(html), /Nivel de diésel lleno/);
  assert.match(texto(html), /Consumo diario de agua 10 m³|10 m³/);
  assert.equal(campos.length, Object.keys(enviado).length, `${campos.length} preguntas en el formulario`);
});

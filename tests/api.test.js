/* Pruebas de la API con una base SQLite en memoria. Ejecutar: npm test */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { abrirBaseDatos } from '../server/db/connection.js';
import { crearApp } from '../server/app.js';
import { SISTEMAS } from '../public/js/data/systems.js';
import { diaLocal } from '../server/utils/dates.js';

let servidor;
let base;
let db;

before(async () => {
  db = abrirBaseDatos(':memory:', { silencioso: true });
  servidor = crearApp(db).listen(0);
  await new Promise(r => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.close();
  db.close();
});

/* Cliente con cookie de sesión propia */
function cliente() {
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      redirect: 'manual',
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const nueva = r.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    const esJson = (r.headers.get('content-type') || '').includes('application/json');
    const html = esJson ? '' : await r.text();
    const datos = esJson ? await r.json() : null;
    return { estado: r.status, datos, html, ubicacion: r.headers.get('location') };
  };
  return {
    get: ruta => pedir('GET', ruta),
    post: (ruta, c) => pedir('POST', ruta, c ?? {}),
    put: (ruta, c) => pedir('PUT', ruta, c ?? {}),
    del: ruta => pedir('DELETE', ruta),
    login: (usuario, password = '123') => pedir('POST', '/api/auth/login', { usuario, password })
  };
}

/* Inicia un recorrido y lo deja como iniciado hace 10 minutos. Devuelve el id del recorrido abierto. */
async function iniciarRecorrido(c, tipoRecorrido = 'manana') {
  const r = await c.post('/api/progreso/iniciar', { tipoRecorrido });
  assert.equal(r.estado, 201, r.datos?.error);
  const id = r.datos.inspeccionActiva.id;
  db.prepare('UPDATE recorridos_abiertos SET iniciado_en = ? WHERE id = ?').run(new Date(Date.now() - 600000).toISOString(), id);
  return id;
}

/* Informe completo: todos los campos llenos, una no conformidad opcional */
function informeCompleto(noConforme = '', recorridoId = '') {
  const datos = {};
  for (const s of SISTEMAS) {
    for (const c of s.paneles.flatMap(p => p.campos)) {
      if (c.tipo === 'verificacion') datos[c.id] = c.id === noConforme ? { estado: 'No conforme', detalle: 'Fuga en válvula' } : { estado: 'Conforme', detalle: '' };
      else datos[c.id] = c.tipo === 'textarea' ? 'Sin fallas registradas' : '10';
    }
  }
  return { recorridoId, datos, justificacionesSistemas: {}, ordenRecorrido: SISTEMAS.map(s => s.id) };
}

test('la base se crea con usuarios y rol semanal iniciales', () => {
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM semanas_rol').get().n, 4);
  const hash = db.prepare("SELECT password_hash FROM usuarios WHERE usuario = 'rsalas'").get().password_hash;
  assert.match(hash, /^scrypt\$/, 'la contraseña se guarda con hash');
});

test('páginas: redirigen según la sesión', async () => {
  const c = cliente();
  assert.equal((await c.get('/')).ubicacion, '/login');
  assert.equal((await c.get('/app')).ubicacion, '/login');
  await c.login('rsalas');
  assert.equal((await c.get('/')).ubicacion, '/app');
  assert.equal((await c.get('/login')).ubicacion, '/app');
});

test('vistas EJS: login, app por rol, errores y direcciones antiguas', async () => {
  const c = cliente();
  const login = await c.get('/login');
  assert.equal(login.estado, 200);
  assert.match(login.html, /<title>Iniciar sesión · Casa de Máquinas<\/title>/);
  assert.match(login.html, /data-submit="login"/);
  assert.match(login.html, /href="\/css\/login\.css"/);
  assert.match(login.html, /<svg class="icon login-input-icon"/, 'iconos generados en el servidor');

  await c.login('rsalas');
  const app = (await c.get('/app')).html;
  assert.match(app, /href="\/css\/main\.css"/);
  assert.match(app, /id="txtNombreUsuario" class="user-name">Ronald Salas Herrera</);
  assert.match(app, />RS</, 'iniciales del avatar');
  assert.match(app, /id="btnIrDevolucionesInspector"/);
  assert.doesNotMatch(app, /btnIrDashboardIngeniero|id="vista-dashboard"|id="modalTecnico"/, 'el técnico no recibe vistas del ingeniero');

  const ing = cliente();
  await ing.login('ingeniero');
  const appIng = (await ing.get('/app')).html;
  assert.match(appIng, /id="vista-dashboard"/);
  assert.match(appIng, /id="modalTecnico"/);
  assert.doesNotMatch(appIng, /id="tecnicoTurno"/, 'el formulario de usuario ya no pide el turno');
  assert.doesNotMatch(appIng, /id="vista-inicio"/);

  // Escapado de datos en las vistas
  const nombreRaro = '<b>Prueba</b> & "Co"';
  const creado = await ing.post('/api/usuarios', { nombre: nombreRaro, rol: 'ingeniero', usuario: 'escape.test', password: 'abc123', estado: 'Activo' });
  const raro = cliente();
  await raro.login('escape.test', 'abc123');
  const appRaro = (await raro.get('/app')).html;
  assert.ok(appRaro.includes('&lt;b&gt;Prueba&lt;/b&gt; &amp; &#34;Co&#34;'), 'el nombre se escapa en el HTML');
  assert.ok(!appRaro.includes('<b>Prueba</b>'));
  assert.equal(creado.estado, 201);

  const noExiste = await c.get('/no-existe');
  assert.equal(noExiste.estado, 404);
  assert.match(noExiste.html, /Página no encontrada/);

  assert.equal((await c.get('/pages/app.html')).ubicacion, '/app');
  assert.equal((await cliente().get('/pages/login.html')).ubicacion, '/login');
  assert.equal((await c.get('/api/no-existe')).datos.error, 'Ruta de la API no encontrada.');
});

test('inicio de sesión: credenciales, inactivos y respuesta sin contraseña', async () => {
  const c = cliente();
  assert.equal((await c.get('/api/datos')).estado, 401);
  assert.equal((await c.login('rsalas', 'mala')).estado, 401);
  assert.equal((await c.login('noexiste')).estado, 401);
  const ok = await c.login('RSALAS');
  assert.equal(ok.estado, 200);
  assert.equal(ok.datos.usuario.nombre, 'Ronald Salas Herrera');
  assert.equal(ok.datos.usuario.password_hash, undefined);
  assert.equal((await c.get('/api/auth/sesion')).datos.usuario.rol, 'inspector');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/sesion')).estado, 401);
});

test('bloqueo temporal tras 5 intentos fallidos', async () => {
  const c = cliente();
  for (let i = 0; i < 5; i++) await c.login('ebolanos', 'mala');
  const r = await c.login('ebolanos', '123');
  assert.equal(r.estado, 429);
});

test('permisos por rol', async () => {
  const tecnico = cliente();
  await tecnico.login('cmurillo');
  assert.equal((await tecnico.get('/api/usuarios')).estado, 403);
  assert.equal((await tecnico.post('/api/cronograma', { inicio: '2026-12-07', fin: '2026-12-13', tecnicoId: 'usr-3' })).estado, 403);
  const datos = (await tecnico.get('/api/datos')).datos;
  assert.deepEqual(datos.usuarios, [], 'el técnico no recibe la lista de usuarios');

  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  assert.equal((await ingeniero.post('/api/inspecciones', informeCompleto())).estado, 403);
  assert.ok((await ingeniero.get('/api/usuarios')).datos.every(u => !('password_hash' in u)));
});

test('informe incompleto sin justificación es rechazado', async () => {
  const c = cliente();
  await c.login('cmurillo');
  const informe = informeCompleto('', await iniciarRecorrido(c, 'manana'));
  delete informe.datos.nivelDiesel;
  const r = await c.post('/api/inspecciones', informe);
  assert.equal(r.estado, 400);
  assert.equal(r.datos.titulo, 'Informe incompleto');

  informe.datos.fugasIncendio = { estado: 'No conforme', detalle: '' };
  informe.datos.nivelDiesel = '1/2';
  assert.equal((await c.post('/api/inspecciones', informe)).estado, 400, 'No conforme exige detalle');
  assert.equal((await c.del('/api/progreso')).estado, 204, 'libera el recorrido de la mañana');
});

test('flujo completo: envío, devolución, respuesta y aprobación', async () => {
  const tecnico = cliente();
  await tecnico.login('rsalas');
  const recorridoId = await iniciarRecorrido(tecnico, 'manana');
  assert.equal((await tecnico.put('/api/progreso', { inspeccionActiva: { id: recorridoId }, respuestas: { nivelDiesel: '1/2' } })).estado, 204);
  const borrador = (await tecnico.get('/api/progreso')).datos;
  assert.equal(borrador.respuestas.nivelDiesel, '1/2');
  assert.equal(borrador.inspeccionActiva.tipoRecorrido, 'manana', 'el servidor conserva el tipo de recorrido');

  const creado = await tecnico.post('/api/inspecciones', informeCompleto('fugasIncendio', recorridoId));
  assert.equal(creado.estado, 201);
  const informe = creado.datos;
  assert.equal(informe.resultado, 'Con anomalías');
  assert.equal(informe.estadoRevision, 'Pendiente de revisión');
  assert.equal(informe.inspector, 'Ronald Salas Herrera');
  assert.equal(informe.iniciadoPor, null, 'lo inició el mismo técnico');
  assert.deepEqual(informe.datos.fugasIncendio, { estado: 'No conforme', detalle: 'Fuga en válvula' });
  assert.equal(informe.ordenRecorrido.length, SISTEMAS.length);
  assert.ok(informe.duracionSegundos >= 599);
  assert.equal((await tecnico.get('/api/progreso')).datos, null, 'el borrador se elimina al enviar');

  assert.equal((await tecnico.post('/api/inspecciones', informeCompleto('', recorridoId))).estado, 409, 'el recorrido ya se cerró');
  const otro = cliente();
  await otro.login('cmurillo');
  const repetido = await otro.post('/api/progreso/iniciar', { tipoRecorrido: 'manana' });
  assert.equal(repetido.estado, 409, 'un solo recorrido de mañana por día para todos');
  assert.equal(repetido.datos.titulo, 'Recorrido ya completado');

  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  assert.equal((await ingeniero.put(`/api/inspecciones/${informe.id}/revision`, { estadoRevision: 'Con observaciones' })).estado, 400);
  const devuelto = await ingeniero.put(`/api/inspecciones/${informe.id}/revision`, { estadoRevision: 'Con observaciones', observaciones: 'Adjuntar evidencia' });
  assert.equal(devuelto.datos.estadoRevision, 'Con observaciones');
  assert.equal(devuelto.datos.ingenieroRevisor, 'Ing. Supervisor General');

  const otroTecnico = cliente();
  await otroTecnico.login('cmurillo');
  assert.equal((await otroTecnico.post(`/api/inspecciones/${informe.id}/respuesta`, { texto: 'x' })).estado, 404, 'solo el autor responde');
  assert.ok(!(await otroTecnico.get('/api/datos')).datos.registros.some(r => r.id === informe.id), 'un técnico no ve informes ajenos');

  const respondido = await tecnico.post(`/api/inspecciones/${informe.id}/respuesta`, { texto: 'Se cambió el empaque' });
  assert.equal(respondido.datos.estadoRevision, 'Respuesta enviada por técnico');
  assert.equal(respondido.datos.historialConversacion.length, 2);
  assert.equal((await tecnico.post(`/api/inspecciones/${informe.id}/respuesta`, { texto: 'otra' })).estado, 403);

  const aprobado = await ingeniero.put(`/api/inspecciones/${informe.id}/revision`, { estadoRevision: 'Aprobada' });
  assert.equal(aprobado.datos.estadoRevision, 'Aprobada');
});

test('informe parcial con justificaciones', async () => {
  const c = cliente();
  await c.login('cmurillo');
  const informe = { ...informeCompleto('', await iniciarRecorrido(c, 'tarde')), datos: {}, ordenRecorrido: [] };
  informe.justificacionesSistemas = Object.fromEntries(SISTEMAS.map(s => [s.id, 'Equipo en mantenimiento']));
  const r = await c.post('/api/inspecciones', informe);
  assert.equal(r.estado, 201);
  assert.equal(r.datos.resultado, 'Inspección parcial justificada');
  assert.equal(r.datos.tipoRecorrido, 'tarde');
  assert.equal(Object.keys(r.datos.justificacionesSistemas).length, SISTEMAS.length);
});

test('cancelación de recorrido', async () => {
  const c = cliente();
  await c.login('cmurillo');
  assert.equal((await c.post('/api/cancelaciones', { horaInicioISO: new Date().toISOString(), justificacion: 'no' })).estado, 400);
  const r = await c.post('/api/cancelaciones', { tipoRecorrido: 'manana', horaInicioISO: new Date().toISOString(), justificacion: 'Emergencia eléctrica', sistemasIniciados: ['incendios', 'inventado'] });
  assert.equal(r.estado, 201);
  assert.deepEqual(r.datos.sistemasIniciados, ['incendios'], 'descarta sistemas inexistentes');
});

test('gestión de usuarios', async () => {
  const c = cliente();
  await c.login('ingeniero');
  const nuevo = await c.post('/api/usuarios', { nombre: 'Ana Prueba', rol: 'inspector', usuario: 'aprueba', password: 'clave1', turno: 'Diurno (06:00 - 14:00)', estado: 'Activo' });
  assert.equal(nuevo.estado, 201);
  assert.equal((await c.post('/api/usuarios', { nombre: 'Otra', rol: 'inspector', usuario: 'APRUEBA', password: 'x12', turno: 'Diurno (06:00 - 14:00)', estado: 'Activo' })).estado, 409);

  const ana = cliente();
  assert.equal((await ana.login('aprueba', 'clave1')).estado, 200);

  // Desactivar cierra sus sesiones y bloquea el acceso
  await c.put(`/api/usuarios/${nuevo.datos.id}`, { ...nuevo.datos, estado: 'Inactivo / Vacaciones', password: '' });
  assert.equal((await ana.get('/api/datos')).estado, 401);
  assert.equal((await ana.login('aprueba', 'clave1')).estado, 403);

  // El ingeniero no puede desactivarse a sí mismo
  const yo = (await c.get('/api/usuarios')).datos.find(u => u.usuario === 'ingeniero');
  assert.equal((await c.put(`/api/usuarios/${yo.id}`, { ...yo, estado: 'Inactivo / Vacaciones' })).estado, 409);
});

test('rol semanal: crear, editar y eliminar', async () => {
  const c = cliente();
  await c.login('ingeniero');
  assert.equal((await c.post('/api/cronograma', { inicio: '2026-12-13', fin: '2026-12-07', tecnicoId: 'usr-2' })).estado, 400);
  assert.equal((await c.post('/api/cronograma', { inicio: '2026-12-07', fin: '2026-12-13', tecnicoId: 'usr-1' })).estado, 400, 'solo técnicos');
  const s = await c.post('/api/cronograma', { inicio: '2026-12-07', fin: '2026-12-13', tecnicoId: 'usr-2', notas: 'ATS' });
  assert.equal(s.estado, 201);
  assert.equal(s.datos.tecnico, 'Ronald Salas Herrera');
  const editada = await c.put(`/api/cronograma/${s.datos.id}`, { ...s.datos, notas: 'Editada' });
  assert.equal(editada.datos.notas, 'Editada');
  assert.equal((await c.del(`/api/cronograma/${s.datos.id}`)).estado, 204);
  assert.equal((await c.del(`/api/cronograma/${s.datos.id}`)).estado, 404);
});

test('otro técnico continúa un recorrido a medias si el ingeniero lo habilita', async () => {
  // Los recorridos de hoy ya se usaron en los tests anteriores: se empieza con el día libre
  db.exec('DELETE FROM inspecciones');

  const a = cliente();
  await a.login('rsalas');
  const b = cliente();
  await b.login('cmurillo');
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');

  const recorridoId = await iniciarRecorrido(a, 'manana');
  await a.put('/api/progreso', { inspeccionActiva: { id: recorridoId }, respuestas: { nivelDiesel: '3/4' }, ordenRecorrido: ['incendios'] });

  const abiertos = (await b.get('/api/recorridos-abiertos')).datos;
  assert.equal(abiertos.length, 1);
  assert.equal(abiertos[0].iniciadoPor, 'Ronald Salas Herrera');
  assert.equal(abiertos[0].sistemasIniciados, 1);
  assert.equal(abiertos[0].datos, undefined, 'el listado no incluye las respuestas');

  const ocupado = await b.post('/api/progreso/iniciar', { tipoRecorrido: 'manana' });
  assert.equal(ocupado.estado, 409);
  assert.equal(ocupado.datos.titulo, 'Recorrido ya iniciado');

  // Con el ajuste apagado nadie lo puede tomar
  assert.equal((await b.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'cmurillo', password: '123' })).estado, 403);
  assert.equal((await b.put('/api/ajustes', { permitirTomaRecorridos: true })).estado, 403, 'solo el ingeniero cambia el ajuste');
  assert.equal((await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: 'si' })).estado, 400);
  assert.equal((await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: true })).datos.permitirTomaRecorridos, true);

  // Exige el usuario y la contraseña de quien lo toma
  assert.equal((await b.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'cmurillo', password: 'mala' })).estado, 401);
  assert.equal((await b.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'rsalas', password: '123' })).estado, 401, 'no sirven credenciales ajenas');
  assert.equal((await a.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'rsalas', password: '123' })).estado, 409, 'ya es suyo');
  const tomado = await b.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'CMURILLO', password: '123' });
  assert.equal(tomado.estado, 200);
  assert.equal(tomado.datos.respuestas.nivelDiesel, '3/4', 'conserva lo que registró el primer técnico');

  // El técnico original ya no puede guardar, enviar ni cancelar
  const guardarA = await a.put('/api/progreso', { inspeccionActiva: { id: recorridoId }, respuestas: {} });
  assert.equal(guardarA.estado, 409);
  assert.equal(guardarA.datos.codigo, 'recorrido-no-disponible');
  assert.match(guardarA.datos.error, /Carlos Murillo Vargas/);
  assert.equal((await a.post('/api/inspecciones', informeCompleto('', recorridoId))).estado, 409);
  assert.equal((await a.post('/api/cancelaciones', { recorridoId, justificacion: 'Fin de turno' })).estado, 409);
  assert.equal((await a.get('/api/progreso')).datos, null);

  const datosB = (await b.get('/api/datos')).datos;
  assert.equal(datosB.progreso.inspeccionActiva.id, recorridoId);
  assert.equal(datosB.recorridosHoy.manana.estado, 'abierto');
  assert.equal(datosB.recorridosHoy.manana.responsable, 'Carlos Murillo Vargas');

  const enviado = await b.post('/api/inspecciones', informeCompleto('', recorridoId));
  assert.equal(enviado.estado, 201);
  assert.equal(enviado.datos.inspector, 'Carlos Murillo Vargas');
  assert.equal(enviado.datos.iniciadoPor, 'Ronald Salas Herrera');
  assert.ok(enviado.datos.duracionSegundos >= 599, 'la duración cuenta desde que lo inició el primer técnico');

  const datosA = (await a.get('/api/datos')).datos;
  assert.ok(datosA.registros.some(r => r.id === enviado.datos.id), 'quien lo inició también ve el informe');
  assert.equal(datosA.recorridosHoy.manana.estado, 'enviado');
  assert.equal(datosA.recorridosHoy.manana.iniciadoPor, 'Ronald Salas Herrera');
  assert.equal((await a.get(`/api/inspecciones/${enviado.datos.id}`)).estado, 200);
  assert.equal((await a.post('/api/progreso/iniciar', { tipoRecorrido: 'manana' })).estado, 409);

  await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: false });
});

test('migración: una base anterior conserva el recorrido en curso', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sidem-migracion-'));
  const ruta = path.join(carpeta, 'sidem.db');
  const vieja = new DatabaseSync(ruta);
  vieja.exec(`
    CREATE TABLE usuarios (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL, usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, cedula TEXT NOT NULL DEFAULT '', turno TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'Activo', creado_en TEXT NOT NULL);
    CREATE TABLE inspecciones (id TEXT PRIMARY KEY, inspector_id TEXT NOT NULL, tipo_recorrido TEXT NOT NULL, fecha_local TEXT NOT NULL,
      hora_inicio TEXT NOT NULL, estado_revision TEXT NOT NULL DEFAULT 'Pendiente de revisión');
    CREATE TABLE recorridos_en_curso (usuario_id TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado_en TEXT NOT NULL);
    INSERT INTO usuarios (id, nombre, rol, usuario, password_hash, creado_en) VALUES ('usr-2', 'Ronald', 'inspector', 'rsalas', 'x', '2026-01-01');`);
  const inicio = new Date().toISOString();
  vieja.prepare('INSERT INTO recorridos_en_curso VALUES (?, ?, ?)')
    .run('usr-2', JSON.stringify({ inspeccionActiva: { id: 'insp-1', tipoRecorrido: 'tarde', horaInicioISO: inicio }, respuestas: { a: '1' } }), inicio);
  vieja.close();

  const migrada = abrirBaseDatos(ruta, { silencioso: true });
  try {
    const columnas = migrada.prepare('PRAGMA table_info(inspecciones)').all().map(c => c.name);
    assert.ok(columnas.includes('iniciado_por_id'));
    assert.ok(!migrada.prepare("SELECT 1 FROM sqlite_master WHERE name = 'recorridos_en_curso'").get(), 'se elimina la tabla anterior');
    const fila = migrada.prepare('SELECT * FROM recorridos_abiertos').get();
    assert.equal(fila.id, 'insp-1', 'conserva el id para que el navegador siga guardando');
    assert.equal(fila.tipo_recorrido, 'tarde');
    assert.equal(fila.responsable_id, 'usr-2');
    assert.equal(JSON.parse(fila.datos).respuestas.a, '1');
  } finally {
    migrada.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

/* ---- Recorridos sin terminar de días anteriores (mañana y tarde) ---- */

const NOMBRE = { manana: 'mañana', tarde: 'tarde' };
const OTRO_TIPO = { manana: 'tarde', tarde: 'manana' };
const RONALD = 'usr-2';
const CARLOS = 'usr-3';

/* Día libre: sin informes ni recorridos abiertos, y con la opción de continuar apagada */
function empezarDiaLimpio() {
  db.exec("DELETE FROM inspecciones; DELETE FROM recorridos_abiertos; DELETE FROM ajustes");
}

/* Recorrido abierto iniciado hace "dias" días (se inserta directo: la app lo pasaría a hoy al leerlo) */
function recorridoDeDiasAtras(usuarioId, tipoRecorrido, dias) {
  const inicio = new Date(Date.now() - dias * 24 * 3600 * 1000);
  const id = `rec-viejo-${tipoRecorrido}-${dias}-${usuarioId}`;
  const datos = { inspeccionActiva: { id, tipoRecorrido, horaInicioISO: inicio.toISOString(), fechaISO: inicio.toISOString() }, respuestas: { nivelDiesel: '1/4' }, ordenRecorrido: ['incendios'] };
  db.prepare(`INSERT INTO recorridos_abiertos (id, tipo_recorrido, fecha_local, iniciado_por_id, iniciado_en, responsable_id, datos, actualizado_en)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tipoRecorrido, diaLocal(inicio), usuarioId, inicio.toISOString(), usuarioId, JSON.stringify(datos), inicio.toISOString());
  return { id, inicio };
}

const fechaDe = id => db.prepare('SELECT fecha_local FROM recorridos_abiertos WHERE id = ?').get(id)?.fecha_local;
const diaDe = iso => diaLocal(new Date(iso));

async function tecnicos() {
  const ronald = cliente();
  await ronald.login('rsalas');
  const carlos = cliente();
  await carlos.login('cmurillo');
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  return { ronald, carlos, ingeniero };
}

for (const tipo of ['manana', 'tarde']) {
  test(`${NOMBRE[tipo]}: el recorrido sin terminar de ayer pasa a hoy y quien lo inició lo completa`, async () => {
    empezarDiaLimpio();
    const { ronald, carlos } = await tecnicos();
    const { id, inicio } = recorridoDeDiasAtras(RONALD, tipo, 1);

    const datos = (await ronald.get('/api/datos')).datos;
    assert.equal(datos.progreso.inspeccionActiva.id, id, 'lo retoma al abrir la app');
    assert.equal(datos.progreso.respuestas.nivelDiesel, '1/4', 'conserva lo registrado ayer');
    assert.equal(datos.recorridosHoy[tipo].estado, 'abierto', `cuenta como el recorrido de la ${NOMBRE[tipo]} de hoy`);
    assert.equal(datos.recorridosHoy[tipo].responsable, 'Ronald Salas Herrera');
    assert.equal(datos.recorridosHoy[OTRO_TIPO[tipo]].estado, 'libre', 'el otro recorrido de hoy no se toca');
    assert.equal(fechaDe(id), diaLocal(), 'quedó con la fecha de hoy');

    const repetido = await carlos.post('/api/progreso/iniciar', { tipoRecorrido: tipo });
    assert.equal(repetido.estado, 409, 'no se abre un segundo recorrido del mismo tipo hoy');
    assert.equal(repetido.datos.titulo, 'Recorrido ya iniciado');

    // Ronald sigue guardando avance hoy
    assert.equal((await ronald.put('/api/progreso', { inspeccionActiva: { id }, respuestas: { nivelDiesel: '1/2' } })).estado, 204);

    const enviado = await ronald.post('/api/inspecciones', informeCompleto('', id));
    assert.equal(enviado.estado, 201, enviado.datos?.error);
    assert.equal(enviado.datos.tipoRecorrido, tipo);
    assert.equal(diaDe(enviado.datos.fechaISO), diaLocal(), 'el informe queda con la fecha de hoy');
    assert.equal(enviado.datos.horaInicioISO, inicio.toISOString(), 'conserva la hora real de inicio');
    assert.equal(enviado.datos.iniciadoPor, null);

    const despues = (await carlos.get('/api/datos')).datos;
    assert.equal(despues.recorridosHoy[tipo].estado, 'enviado');
    assert.equal(despues.recorridosHoy[tipo].completadoPor, 'Ronald Salas Herrera');
    assert.equal((await carlos.post('/api/progreso/iniciar', { tipoRecorrido: tipo })).estado, 409, 'ya quedó completado hoy');
    assert.equal((await carlos.post('/api/progreso/iniciar', { tipoRecorrido: OTRO_TIPO[tipo] })).estado, 201, 'el otro recorrido de hoy sigue disponible');
  });

  test(`${NOMBRE[tipo]}: otro técnico continúa al día siguiente el recorrido que quedó a medias`, async () => {
    empezarDiaLimpio();
    const { ronald, carlos, ingeniero } = await tecnicos();
    const { id, inicio } = recorridoDeDiasAtras(RONALD, tipo, 1);

    const abiertos = (await carlos.get('/api/recorridos-abiertos')).datos;
    assert.equal(abiertos.length, 1);
    assert.equal(abiertos[0].fechaLocal, diaLocal(), 'aparece como recorrido de hoy');
    assert.equal(abiertos[0].tipoRecorrido, tipo);

    assert.equal((await carlos.post(`/api/recorridos-abiertos/${id}/tomar`, { usuario: 'cmurillo', password: '123' })).estado, 403, 'sin permiso del ingeniero');
    await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: true });
    const tomado = await carlos.post(`/api/recorridos-abiertos/${id}/tomar`, { usuario: 'cmurillo', password: '123' });
    assert.equal(tomado.estado, 200);
    assert.equal(tomado.datos.respuestas.nivelDiesel, '1/4');
    assert.equal((await ronald.put('/api/progreso', { inspeccionActiva: { id }, respuestas: {} })).estado, 409, 'Ronald ya no puede guardar');

    const enviado = await carlos.post('/api/inspecciones', informeCompleto('', id));
    assert.equal(enviado.estado, 201, enviado.datos?.error);
    assert.equal(enviado.datos.inspector, 'Carlos Murillo Vargas');
    assert.equal(enviado.datos.iniciadoPor, 'Ronald Salas Herrera');
    assert.equal(diaDe(enviado.datos.fechaISO), diaLocal());
    assert.equal(enviado.datos.horaInicioISO, inicio.toISOString());
    assert.ok((await ronald.get('/api/datos')).datos.registros.some(r => r.id === enviado.datos.id), 'Ronald también ve el informe');
  });

  test(`${NOMBRE[tipo]}: cancelar el recorrido de ayer libera el recorrido de hoy`, async () => {
    empezarDiaLimpio();
    const { ronald, carlos } = await tecnicos();
    const { id } = recorridoDeDiasAtras(RONALD, tipo, 1);

    assert.equal((await carlos.post('/api/progreso/iniciar', { tipoRecorrido: tipo })).estado, 409);
    const cancelado = await ronald.post('/api/cancelaciones', { recorridoId: id, justificacion: 'No se pudo terminar por fin de turno' });
    assert.equal(cancelado.estado, 201, cancelado.datos?.error);
    assert.equal(cancelado.datos.tipoRecorrido, tipo);
    assert.equal((await ronald.get('/api/progreso')).datos, null);
    assert.equal((await carlos.post('/api/progreso/iniciar', { tipoRecorrido: tipo })).estado, 201, 'ahora se puede iniciar uno nuevo hoy');
  });

  test(`${NOMBRE[tipo]}: si el de hoy ya se envió, el de ayer conserva su fecha y se puede terminar`, async () => {
    empezarDiaLimpio();
    const { ronald, carlos } = await tecnicos();
    // Carlos hace y envía el recorrido de hoy
    const deHoy = await iniciarRecorrido(carlos, tipo);
    assert.equal((await carlos.post('/api/inspecciones', informeCompleto('', deHoy))).estado, 201);
    // A Ronald le quedó uno de ayer sin terminar
    const { id } = recorridoDeDiasAtras(RONALD, tipo, 1);
    const ayer = diaLocal(new Date(Date.now() - 24 * 3600 * 1000));

    const datos = (await ronald.get('/api/datos')).datos;
    assert.equal(datos.progreso.inspeccionActiva.id, id, 'Ronald lo sigue teniendo');
    assert.equal(datos.recorridosHoy[tipo].estado, 'enviado', 'el de hoy sigue completado');
    assert.equal(fechaDe(id), ayer, 'no se duplica: se queda en su día');

    const enviado = await ronald.post('/api/inspecciones', informeCompleto('', id));
    assert.equal(enviado.estado, 201, enviado.datos?.error);
    assert.equal(diaDe(enviado.datos.fechaISO), ayer, 'cuenta como el recorrido de ayer');
  });

  test(`${NOMBRE[tipo]}: con dos recorridos viejos del mismo tipo, solo el más reciente pasa a hoy`, async () => {
    empezarDiaLimpio();
    const { ronald, carlos } = await tecnicos();
    const deAnteayer = recorridoDeDiasAtras(CARLOS, tipo, 2);
    const deAyer = recorridoDeDiasAtras(RONALD, tipo, 1);

    await ronald.get('/api/datos');
    assert.equal(fechaDe(deAyer.id), diaLocal(), 'el de ayer pasa a hoy');
    assert.equal(fechaDe(deAnteayer.id), diaLocal(new Date(Date.now() - 2 * 24 * 3600 * 1000)), 'el de anteayer se queda en su día');

    // Los dos se pueden terminar, cada uno en su día
    const ayer = await ronald.post('/api/inspecciones', informeCompleto('', deAyer.id));
    const anteayer = await carlos.post('/api/inspecciones', informeCompleto('', deAnteayer.id));
    assert.equal(ayer.estado, 201, ayer.datos?.error);
    assert.equal(anteayer.estado, 201, anteayer.datos?.error);
    assert.equal(diaDe(ayer.datos.fechaISO), diaLocal());
    assert.notEqual(diaDe(anteayer.datos.fechaISO), diaLocal());
  });
}

test('mañana y tarde de ayer sin terminar: los dos pasan a hoy sin mezclarse', async () => {
  empezarDiaLimpio();
  const { ronald, carlos } = await tecnicos();
  const manana = recorridoDeDiasAtras(RONALD, 'manana', 1);
  const tarde = recorridoDeDiasAtras(CARLOS, 'tarde', 1);

  const hoy = (await ronald.get('/api/datos')).datos.recorridosHoy;
  assert.equal(hoy.manana.estado, 'abierto');
  assert.equal(hoy.manana.responsable, 'Ronald Salas Herrera');
  assert.equal(hoy.tarde.estado, 'abierto');
  assert.equal(hoy.tarde.responsable, 'Carlos Murillo Vargas');

  assert.equal((await ronald.get('/api/progreso')).datos.inspeccionActiva.id, manana.id);
  assert.equal((await carlos.get('/api/progreso')).datos.inspeccionActiva.id, tarde.id);

  const m = await ronald.post('/api/inspecciones', informeCompleto('', manana.id));
  const t = await carlos.post('/api/inspecciones', informeCompleto('', tarde.id));
  assert.equal(m.datos.tipoRecorrido, 'manana');
  assert.equal(t.datos.tipoRecorrido, 'tarde');
  assert.equal(diaDe(m.datos.fechaISO), diaLocal());
  assert.equal(diaDe(t.datos.fechaISO), diaLocal());

  const final = (await ronald.get('/api/datos')).datos.recorridosHoy;
  assert.equal(final.manana.estado, 'enviado');
  assert.equal(final.tarde.estado, 'enviado');
  assert.equal((await ronald.post('/api/progreso/iniciar', { tipoRecorrido: 'manana' })).estado, 409);
  assert.equal((await ronald.post('/api/progreso/iniciar', { tipoRecorrido: 'tarde' })).estado, 409);
});


test('cambio de contraseña propio', async () => {
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const creado = await ingeniero.post('/api/usuarios', { nombre: 'Clave Prueba', rol: 'inspector', usuario: 'clave.prueba', password: 'inicial1', turno: 'Diurno (06:00 - 14:00)', estado: 'Activo' });
  assert.equal(creado.estado, 201);

  const equipo1 = cliente();
  const equipo2 = cliente();
  await equipo1.login('clave.prueba', 'inicial1');
  await equipo2.login('clave.prueba', 'inicial1');

  assert.equal((await cliente().put('/api/auth/contrasena', { actual: 'inicial1', nueva: 'nueva123' })).estado, 401, 'requiere sesión');
  assert.equal((await equipo1.put('/api/auth/contrasena', { actual: '', nueva: 'nueva123' })).estado, 400);
  const mala = await equipo1.put('/api/auth/contrasena', { actual: 'equivocada', nueva: 'nueva123' });
  assert.equal(mala.estado, 400);
  assert.equal(mala.datos.titulo, 'Contraseña incorrecta');
  assert.equal((await equipo1.put('/api/auth/contrasena', { actual: 'inicial1', nueva: 'corta' })).estado, 400, 'mínimo 6 caracteres');
  assert.equal((await equipo1.put('/api/auth/contrasena', { actual: 'inicial1', nueva: 'inicial1' })).estado, 400, 'distinta de la actual');
  assert.equal((await equipo1.put('/api/auth/contrasena', { actual: 'inicial1', nueva: 'clave.prueba' })).estado, 400, 'distinta del usuario');
  assert.equal((await equipo1.put('/api/auth/contrasena', { actual: 'inicial1', nueva: ' nueva123 ' })).estado, 400, 'sin espacios al inicio o final');

  assert.equal((await equipo1.put('/api/auth/contrasena', { actual: 'inicial1', nueva: 'nueva123' })).estado, 204);
  assert.equal((await equipo1.get('/api/auth/sesion')).estado, 200, 'la sesión de este equipo sigue abierta');
  assert.equal((await equipo2.get('/api/auth/sesion')).estado, 401, 'se cierran las sesiones de otros equipos');
  assert.equal((await cliente().login('clave.prueba', 'inicial1')).estado, 401, 'la contraseña anterior ya no sirve');
  assert.equal((await cliente().login('clave.prueba', 'nueva123')).estado, 200, 'entra con la nueva');
  const hash = db.prepare("SELECT password_hash FROM usuarios WHERE usuario = 'clave.prueba'").get().password_hash;
  assert.match(hash, /^scrypt\$/, 'se guarda con hash');

  // El ingeniero también puede cambiar la suya
  assert.equal((await ingeniero.put('/api/auth/contrasena', { actual: '123', nueva: 'ingenieria2026' })).estado, 204);
  assert.equal((await cliente().login('ingeniero', 'ingenieria2026')).estado, 200);
  assert.equal((await ingeniero.put('/api/auth/contrasena', { actual: 'ingenieria2026', nueva: 'otra123456' })).estado, 204);
  db.prepare("UPDATE usuarios SET password_hash = (SELECT password_hash FROM usuarios WHERE usuario = 'rsalas') WHERE usuario = 'ingeniero'").run();
});

test('cambio de contraseña: se bloquea tras 5 intentos con la contraseña actual incorrecta', async () => {
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  await ingeniero.post('/api/usuarios', { nombre: 'Bloqueo Prueba', rol: 'inspector', usuario: 'bloqueo.prueba', password: 'inicial1', turno: 'Diurno (06:00 - 14:00)', estado: 'Activo' });
  const c = cliente();
  await c.login('bloqueo.prueba', 'inicial1');
  for (let i = 0; i < 5; i++) await c.put('/api/auth/contrasena', { actual: 'mala', nueva: 'nueva123' });
  assert.equal((await c.put('/api/auth/contrasena', { actual: 'inicial1', nueva: 'nueva123' })).estado, 429);
});

test('usuarios sin turno: se crean y se editan sin pedirlo', async () => {
  const c = cliente();
  await c.login('ingeniero');
  const nuevo = await c.post('/api/usuarios', { nombre: 'Sin Turno', rol: 'inspector', usuario: 'sin.turno', password: 'clave1', estado: 'Activo' });
  assert.equal(nuevo.estado, 201, nuevo.datos?.error);
  assert.equal(nuevo.datos.turno, '');

  // Un técnico que ya tenía turno lo conserva al editarlo sin enviar el turno
  const ronald = (await c.get('/api/usuarios')).datos.find(u => u.usuario === 'rsalas');
  const { turno: _sinTurno, ...sinTurno } = ronald;
  const editado = await c.put(`/api/usuarios/${ronald.id}`, { ...sinTurno, cedula: '2-0789-0124', password: '' });
  assert.equal(editado.estado, 200, editado.datos?.error);
  assert.equal(editado.datos.turno, 'Diurno (06:00 - 14:00)');
  assert.equal(editado.datos.cedula, '2-0789-0124');

  // Un turno inválido sigue rechazándose si alguien lo envía
  assert.equal((await c.post('/api/usuarios', { nombre: 'X', rol: 'inspector', usuario: 'turno.malo', password: 'clave1', turno: 'Inventado', estado: 'Activo' })).estado, 400);
});

test('eliminar usuario: se oculta, no puede entrar y su historial se conserva', async () => {
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const creado = await ingeniero.post('/api/usuarios', { nombre: 'Borrar Prueba', rol: 'inspector', usuario: 'borrar.prueba', password: 'clave1', estado: 'Activo' });
  assert.equal(creado.estado, 201);
  const id = creado.datos.id;

  // Deja historial: una cancelación a su nombre
  const tecnico = cliente();
  await tecnico.login('borrar.prueba', 'clave1');
  assert.equal((await tecnico.post('/api/cancelaciones', { tipoRecorrido: 'manana', horaInicioISO: new Date().toISOString(), justificacion: 'Prueba de historial' })).estado, 201);

  // Permisos y casos no permitidos
  assert.equal((await tecnico.del(`/api/usuarios/${id}`)).estado, 403, 'solo el ingeniero elimina');
  assert.equal((await ingeniero.del('/api/usuarios/usr-no-existe')).estado, 404);
  const yo = (await ingeniero.get('/api/usuarios')).datos.find(u => u.usuario === 'ingeniero');
  assert.equal((await ingeniero.del(`/api/usuarios/${yo.id}`)).estado, 409, 'no se elimina a sí mismo');

  // Con semanas del rol pendientes no se puede: primero hay que reasignarlas
  const semana = await ingeniero.post('/api/cronograma', { inicio: '2099-01-05', fin: '2099-01-11', tecnicoId: id });
  assert.equal(semana.estado, 201);
  const conSemana = await ingeniero.del(`/api/usuarios/${id}`);
  assert.equal(conSemana.estado, 409);
  assert.equal(conSemana.datos.titulo, 'Tiene semanas asignadas');
  await ingeniero.del(`/api/cronograma/${semana.datos.id}`);

  // Con un recorrido en curso tampoco
  const abierto = recorridoDeDiasAtras(id, 'tarde', 3);
  const conRecorrido = await ingeniero.del(`/api/usuarios/${id}`);
  assert.equal(conRecorrido.estado, 409);
  assert.equal(conRecorrido.datos.titulo, 'Tiene un recorrido en curso');
  db.prepare('DELETE FROM recorridos_abiertos WHERE id = ?').run(abierto.id);

  assert.equal((await ingeniero.del(`/api/usuarios/${id}`)).estado, 204);
  assert.equal((await ingeniero.del(`/api/usuarios/${id}`)).estado, 404, 'ya no existe para la app');
  assert.equal((await tecnico.get('/api/auth/sesion')).estado, 401, 'se cierran sus sesiones');
  assert.equal((await cliente().login('borrar.prueba', 'clave1')).estado, 401, 'no puede iniciar sesión');
  assert.ok(!(await ingeniero.get('/api/usuarios')).datos.some(u => u.id === id), 'no aparece en la lista');
  assert.equal((await ingeniero.put(`/api/usuarios/${id}`, { ...creado.datos, password: '' })).estado, 404, 'no se puede editar');
  assert.equal((await ingeniero.post('/api/cronograma', { inicio: '2099-02-02', fin: '2099-02-08', tecnicoId: id })).estado, 400, 'no se le asignan semanas');

  // Su historial sigue con su nombre
  const cancelaciones = (await ingeniero.get('/api/cancelaciones')).datos;
  assert.ok(cancelaciones.some(c => c.inspector === 'Borrar Prueba' && c.justificacion === 'Prueba de historial'));
  assert.ok(db.prepare('SELECT eliminado_en FROM usuarios WHERE id = ?').get(id).eliminado_en, 'la fila se conserva marcada como eliminada');

  // El nombre de usuario queda libre para otra persona
  const reutilizado = await ingeniero.post('/api/usuarios', { nombre: 'Otra Persona', rol: 'inspector', usuario: 'borrar.prueba', password: 'clave2', estado: 'Activo' });
  assert.equal(reutilizado.estado, 201, reutilizado.datos?.error);
  assert.equal((await cliente().login('borrar.prueba', 'clave2')).datos.usuario.nombre, 'Otra Persona');
});

test('migración: una base sin la columna eliminado_en la recibe al arrancar', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sidem-migracion-'));
  const ruta = path.join(carpeta, 'sidem.db');
  const vieja = new DatabaseSync(ruta);
  vieja.exec(`CREATE TABLE usuarios (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL, usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, cedula TEXT NOT NULL DEFAULT '', turno TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'Activo', creado_en TEXT NOT NULL);
    INSERT INTO usuarios (id, nombre, rol, usuario, password_hash, creado_en) VALUES ('usr-1', 'Ing', 'ingeniero', 'ingeniero', 'x', '2026-01-01');`);
  vieja.close();
  const migrada = abrirBaseDatos(ruta, { silencioso: true });
  try {
    assert.ok(migrada.prepare('PRAGMA table_info(usuarios)').all().some(c => c.name === 'eliminado_en'));
    assert.equal(migrada.prepare('SELECT eliminado_en FROM usuarios').get().eliminado_en, null, 'los usuarios existentes siguen vigentes');
  } finally {
    migrada.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

/* ---- Rol Supervisor Técnico (hace recorridos y revisa) ---- */

async function crearSupervisor(ingeniero, usuario = 'sup.prueba') {
  const r = await ingeniero.post('/api/usuarios', { nombre: 'Sofía Supervisora', rol: 'supervisor', usuario, password: 'clave1', estado: 'Activo' });
  assert.equal(r.estado, 201, r.datos?.error);
  const c = cliente();
  await c.login(usuario, 'clave1');
  return { id: r.datos.id, c, datos: r.datos };
}

test('supervisor técnico: recibe las pantallas de los dos roles', async () => {
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const { c, datos } = await crearSupervisor(ingeniero, 'sup.vistas');
  assert.equal(datos.rol, 'supervisor');
  assert.equal(datos.turno, '', 'no recibe el turno fijo de ingeniería');

  const app = (await c.get('/app')).html;
  for (const vista of ['vista-inicio', 'vista-devoluciones', 'vista-inspeccion', 'vista-dashboard', 'vista-historial', 'vista-tecnicos']) {
    assert.match(app, new RegExp(`id="${vista}"`), `incluye ${vista}`);
  }
  assert.equal(app.match(/id="vista-cronograma"/g).length, 1, 'un solo rol semanal');
  assert.match(app, /id="modalTecnico"/, 'puede gestionar usuarios');
  assert.match(app, /role-badge-supervisor">Supervisor Técnico</);
  assert.equal(app.match(/class="nav-item"/g).length, 6, 'menú con las opciones de los dos roles');
  assert.match(app, /<h1 id="tituloPagina">Inicio</, 'empieza en la pantalla de recorridos');

  const tecnico = cliente();
  await tecnico.login('rsalas');
  assert.doesNotMatch((await tecnico.get('/app')).html, /id="vista-dashboard"/, 'el técnico sigue sin ver ingeniería');
  assert.doesNotMatch((await ingeniero.get('/app')).html, /id="vista-inicio"/, 'el ingeniero sigue sin ver recorridos');
});

test('supervisor técnico: puede hacer recorridos y también administrar', async () => {
  empezarDiaLimpio();
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const { id, c } = await crearSupervisor(ingeniero, 'sup.permisos');

  const datos = (await c.get('/api/datos')).datos;
  assert.ok(datos.usuarios.length > 0, 'recibe la lista de usuarios');
  assert.equal((await c.get('/api/usuarios')).estado, 200);
  assert.equal((await c.put('/api/ajustes', { permitirTomaRecorridos: false })).estado, 200);
  const semana = await c.post('/api/cronograma', { inicio: '2099-03-02', fin: '2099-03-08', tecnicoId: id });
  assert.equal(semana.estado, 201, 'puede programar el rol y se le puede asignar a sí mismo');
  await c.del(`/api/cronograma/${semana.datos.id}`);

  const recorridoId = await iniciarRecorrido(c, 'manana');
  assert.equal((await c.get('/api/datos')).datos.progreso.inspeccionActiva.id, recorridoId, 'retoma su recorrido');
  const enviado = await c.post('/api/inspecciones', informeCompleto('', recorridoId));
  assert.equal(enviado.estado, 201, enviado.datos?.error);
  assert.equal(enviado.datos.inspector, 'Sofía Supervisora');
  const ronald = cliente();
  await ronald.login('rsalas');
  await ronald.post('/api/inspecciones', informeCompleto('', await iniciarRecorrido(ronald, 'tarde')));
  assert.equal((await c.get('/api/inspecciones')).datos.length, 2, 've todos los informes, no solo los suyos');
});

test('supervisor técnico: no revisa sus propios recorridos, sí los de otros', async () => {
  empezarDiaLimpio();
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const { c } = await crearSupervisor(ingeniero, 'sup.revision');
  const ronald = cliente();
  await ronald.login('rsalas');

  const propio = await c.post('/api/inspecciones', informeCompleto('', await iniciarRecorrido(c, 'manana')));
  const ajeno = await ronald.post('/api/inspecciones', informeCompleto('', await iniciarRecorrido(ronald, 'tarde')));
  assert.equal(propio.estado, 201);
  assert.equal(ajeno.estado, 201);

  const autoRevision = await c.put(`/api/inspecciones/${propio.datos.id}/revision`, { estadoRevision: 'Aprobada' });
  assert.equal(autoRevision.estado, 403);
  assert.equal(autoRevision.datos.titulo, 'Revisión no permitida');

  const deOtro = await c.put(`/api/inspecciones/${ajeno.datos.id}/revision`, { estadoRevision: 'Aprobada' });
  assert.equal(deOtro.estado, 200);
  assert.equal(deOtro.datos.ingenieroRevisor, 'Sofía Supervisora');

  // El ingeniero devuelve el suyo y ella responde como técnica
  await ingeniero.put(`/api/inspecciones/${propio.datos.id}/revision`, { estadoRevision: 'Con observaciones', observaciones: 'Falta foto' });
  const respuesta = await c.post(`/api/inspecciones/${propio.datos.id}/respuesta`, { texto: 'Foto adjunta' });
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.datos.estadoRevision, 'Respuesta enviada por técnico');
  assert.equal((await c.put(`/api/inspecciones/${propio.datos.id}/revision`, { estadoRevision: 'Aprobada' })).estado, 403, 'tampoco tras responder');
});

test('supervisor técnico: si otro continuó el recorrido que ella inició, tampoco lo revisa', async () => {
  empezarDiaLimpio();
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const { c } = await crearSupervisor(ingeniero, 'sup.continua');
  const ronald = cliente();
  await ronald.login('rsalas');

  const recorridoId = await iniciarRecorrido(c, 'manana');
  await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: true });
  assert.equal((await ronald.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'rsalas', password: '123' })).estado, 200);
  const enviado = await ronald.post('/api/inspecciones', informeCompleto('', recorridoId));
  assert.equal(enviado.datos.iniciadoPor, 'Sofía Supervisora');
  assert.equal((await c.put(`/api/inspecciones/${enviado.datos.id}/revision`, { estadoRevision: 'Aprobada' })).estado, 403, 'lo inició ella');
  assert.equal((await ingeniero.put(`/api/inspecciones/${enviado.datos.id}/revision`, { estadoRevision: 'Aprobada' })).estado, 200);
});

test('supervisor técnico: reglas al cambiarle el rol', async () => {
  empezarDiaLimpio();
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const { id, c, datos } = await crearSupervisor(ingeniero, 'sup.reglas');

  // No se quita a sí misma el permiso de revisión
  assert.equal((await c.put(`/api/usuarios/${id}`, { ...datos, rol: 'inspector', password: '' })).estado, 409);

  // Con semanas pendientes no deja de hacer recorridos
  const semana = await ingeniero.post('/api/cronograma', { inicio: '2099-04-06', fin: '2099-04-12', tecnicoId: id });
  const conSemana = await ingeniero.put(`/api/usuarios/${id}`, { ...datos, rol: 'ingeniero', password: '' });
  assert.equal(conSemana.estado, 409);
  assert.equal(conSemana.datos.titulo, 'Tiene semanas asignadas');
  await ingeniero.del(`/api/cronograma/${semana.datos.id}`);

  // Con un recorrido en curso tampoco
  await iniciarRecorrido(c, 'tarde');
  assert.equal((await ingeniero.put(`/api/usuarios/${id}`, { ...datos, rol: 'ingeniero', password: '' })).datos.titulo, 'Tiene un recorrido en curso');
  await c.del('/api/progreso');

  // Sin pendientes, sí
  const cambiado = await ingeniero.put(`/api/usuarios/${id}`, { ...datos, rol: 'ingeniero', password: '' });
  assert.equal(cambiado.estado, 200, cambiado.datos?.error);
  assert.equal(cambiado.datos.turno, 'Ingeniería / Supervisión');
  assert.equal((await c.get('/api/auth/sesion')).estado, 401, 'al cambiar de rol se cierra su sesión');
  assert.equal((await ingeniero.post('/api/cronograma', { inicio: '2099-05-04', fin: '2099-05-10', tecnicoId: id })).estado, 400, 'ya no se le asignan recorridos');
});

test('supervisor técnico: cuenta como revisor para no dejar el sistema sin supervisión', async () => {
  const ingeniero = cliente();
  await ingeniero.login('ingeniero');
  const yo = (await ingeniero.get('/api/usuarios')).datos.find(u => u.usuario === 'ingeniero');
  // Deja como únicos revisores activos al ingeniero y a una supervisora nueva
  const otrosRevisores = db.prepare("SELECT id FROM usuarios WHERE rol IN ('ingeniero', 'supervisor') AND estado = 'Activo' AND id <> ?").all(yo.id).map(f => f.id);
  db.prepare(`UPDATE usuarios SET estado = 'Inactivo / Vacaciones' WHERE id IN (${otrosRevisores.map(() => '?').join(',') || "''"})`).run(...otrosRevisores);
  const { id, c, datos } = await crearSupervisor(ingeniero, 'sup.unico');

  assert.equal((await c.put(`/api/usuarios/${yo.id}`, { ...yo, estado: 'Inactivo / Vacaciones', password: '' })).estado, 200, 'la supervisora puede desactivar al ingeniero: queda ella como revisora');
  assert.equal((await c.put(`/api/usuarios/${id}`, { ...datos, estado: 'Inactivo / Vacaciones', password: '' })).estado, 409, 'no se desactiva a sí misma');
  db.prepare("UPDATE usuarios SET estado = 'Activo' WHERE id = ?").run(yo.id);

  const otro = cliente();
  await otro.login('ingeniero');
  assert.equal((await otro.del(`/api/usuarios/${id}`)).estado, 204, 'con otro revisor activo sí se elimina');
  assert.equal((await otro.del(`/api/usuarios/${yo.id}`)).estado, 409, 'el ingeniero no se elimina a sí mismo');
});

test('migración: una base con solo dos roles acepta el Supervisor Técnico y conserva sus datos', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sidem-migracion-'));
  const ruta = path.join(carpeta, 'sidem.db');
  const vieja = new DatabaseSync(ruta);
  vieja.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE usuarios (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('inspector', 'ingeniero')),
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, cedula TEXT NOT NULL DEFAULT '', turno TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo / Vacaciones')), creado_en TEXT NOT NULL);
    CREATE TABLE cancelaciones (id TEXT PRIMARY KEY, inspector_id TEXT NOT NULL REFERENCES usuarios (id), tipo_recorrido TEXT,
      hora_inicio TEXT NOT NULL, fecha_cancelacion TEXT NOT NULL, duracion_segundos INTEGER NOT NULL, justificacion TEXT NOT NULL,
      sistemas_iniciados TEXT NOT NULL DEFAULT '[]');
    INSERT INTO usuarios (id, nombre, rol, usuario, password_hash, creado_en) VALUES
      ('usr-1', 'Ing', 'ingeniero', 'ingeniero', 'h1', '2026-01-01'), ('usr-2', 'Ronald', 'inspector', 'rsalas', 'h2', '2026-01-01');
    INSERT INTO cancelaciones VALUES ('c1', 'usr-2', 'manana', '2026-01-01T10:00:00Z', '2026-01-01T10:05:00Z', 300, 'x', '[]');`);
  vieja.close();

  const migrada = abrirBaseDatos(ruta, { silencioso: true });
  try {
    assert.match(migrada.prepare("SELECT sql FROM sqlite_master WHERE name = 'usuarios'").get().sql, /'supervisor'/);
    assert.deepEqual(migrada.prepare('SELECT id, rol, password_hash FROM usuarios ORDER BY id').all().map(u => ({ ...u })),
      [{ id: 'usr-1', rol: 'ingeniero', password_hash: 'h1' }, { id: 'usr-2', rol: 'inspector', password_hash: 'h2' }], 'conserva los usuarios');
    assert.equal(migrada.prepare('PRAGMA foreign_key_check').all().length, 0, 'las referencias siguen válidas');
    assert.equal(migrada.prepare('SELECT u.nombre FROM cancelaciones c JOIN usuarios u ON u.id = c.inspector_id').get().nombre, 'Ronald');
    migrada.prepare("INSERT INTO usuarios (id, nombre, rol, usuario, password_hash, creado_en) VALUES ('usr-3', 'Sofía', 'supervisor', 'sofia', 'h3', '2026-01-01')").run();
    assert.throws(() => migrada.prepare("INSERT INTO cancelaciones VALUES ('c2', 'usr-no', 'manana', 'a', 'b', 1, 'x', '[]')").run(), /FOREIGN KEY/, 'las claves foráneas siguen activas');
  } finally {
    migrada.close();
  }
  // Abrirla otra vez no vuelve a migrar ni falla
  const reabierta = abrirBaseDatos(ruta, { silencioso: true });
  try {
    assert.equal(reabierta.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 3);
  } finally {
    reabierta.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

/* ---- Rol semanal de lunes a viernes ---- */

test('rol semanal: cada semana va de lunes a viernes', async () => {
  const c = cliente();
  await c.login('ingeniero');

  for (const dia of ['2099-06-02', '2099-06-05', '2099-06-06', '2099-06-07']) { // martes, viernes, sábado, domingo
    const r = await c.post('/api/cronograma', { inicio: dia, fin: dia, tecnicoId: 'usr-2' });
    assert.equal(r.estado, 400, `${dia} no es lunes`);
    assert.equal(r.datos.titulo, 'Fecha de inicio no válida');
  }

  // El cierre lo calcula el servidor (viernes), aunque el navegador envíe otro
  const semana = await c.post('/api/cronograma', { inicio: '2099-06-01', fin: '2099-06-07', tecnicoId: 'usr-2' });
  assert.equal(semana.estado, 201, semana.datos?.error);
  assert.equal(semana.datos.inicio, '2099-06-01');
  assert.equal(semana.datos.fin, '2099-06-05', 'termina el viernes');

  const editada = await c.put(`/api/cronograma/${semana.datos.id}`, { ...semana.datos, inicio: '2099-06-08', fin: '2099-06-14' });
  assert.equal(editada.datos.fin, '2099-06-12');
  assert.equal((await c.put(`/api/cronograma/${semana.datos.id}`, { ...semana.datos, inicio: '2099-06-10' })).estado, 400, 'al editar también debe ser lunes');
  await c.del(`/api/cronograma/${semana.datos.id}`);

  // Las semanas iniciales también son de lunes a viernes
  const iniciales = db.prepare("SELECT inicio, fin FROM semanas_rol WHERE id LIKE 'sem-%' ORDER BY inicio").all();
  assert.deepEqual(iniciales.map(s => s.fin), ['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02']);
});

test('migración: las semanas de lunes a domingo pasan a terminar el viernes', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sidem-migracion-'));
  const ruta = path.join(carpeta, 'sidem.db');
  const base = abrirBaseDatos(ruta, { silencioso: true });
  base.exec(`
    DELETE FROM semanas_rol;
    INSERT INTO semanas_rol (id, inicio, fin, tecnico_id) VALUES
      ('lun-dom', '2026-10-19', '2026-10-25', 'usr-2'),
      ('lun-vie', '2026-10-26', '2026-10-30', 'usr-2'),
      ('otra', '2026-11-04', '2026-11-10', 'usr-3');`);
  base.close();

  const migrada = abrirBaseDatos(ruta, { silencioso: true });
  try {
    const fin = id => migrada.prepare('SELECT fin FROM semanas_rol WHERE id = ?').get(id).fin;
    assert.equal(fin('lun-dom'), '2026-10-23', 'de lunes a domingo → de lunes a viernes');
    assert.equal(fin('lun-vie'), '2026-10-30', 'ya era de lunes a viernes');
    assert.equal(fin('otra'), '2026-11-10', 'una semana que no empieza en lunes se deja igual');
  } finally {
    migrada.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

/* ---- Continuar un recorrido en la pregunta donde quedó ---- */

test('otro técnico continúa en el sistema y la pregunta donde quedó el primero', async () => {
  empezarDiaLimpio();
  const { ronald, carlos, ingeniero } = await tecnicos();
  await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: true });

  const recorridoId = await iniciarRecorrido(ronald, 'manana');
  const preguntas = SISTEMAS[1].paneles.flatMap(p => p.campos).filter(c => c.id !== 'observacionesFinales');
  // Ronald terminó el sistema 1, abrió el 2 y alcanzó a responder dos preguntas (guardado automático)
  const sistema1 = Object.fromEntries(SISTEMAS[0].paneles.flatMap(p => p.campos)
    .map(c => [c.id, c.tipo === 'verificacion' ? { estado: 'Conforme', detalle: '' } : '10']));
  const borrador = {
    inspeccionActiva: { id: recorridoId },
    enFormulario: true,
    pasoActual: 1,
    ordenRecorrido: [SISTEMAS[0].id, SISTEMAS[1].id],
    respuestas: { ...sistema1, [preguntas[0].id]: '15', [preguntas[1].id]: '20' }
  };
  assert.equal((await ronald.put('/api/progreso', borrador)).estado, 204);

  // La lista muestra dónde quedó, sin las respuestas
  const [abierto] = (await carlos.get('/api/recorridos-abiertos')).datos;
  assert.deepEqual(abierto.quedoEn, { sistemaIndice: 1, sistema: `2. ${SISTEMAS[1].nombre}`, pregunta: preguntas[2].label, enFormulario: true });
  assert.equal(abierto.sistemasIniciados, 2);
  assert.equal(abierto.datos, undefined);

  // Al tomarlo recibe todo lo que el primero registró y en qué sistema estaba
  const tomado = await carlos.post(`/api/recorridos-abiertos/${recorridoId}/tomar`, { usuario: 'cmurillo', password: '123' });
  assert.equal(tomado.estado, 200);
  assert.equal(tomado.datos.enFormulario, true);
  assert.equal(tomado.datos.pasoActual, 1);
  assert.equal(tomado.datos.respuestas[preguntas[0].id], '15');
  assert.equal(tomado.datos.respuestas[preguntas[1].id], '20');
  assert.equal(tomado.datos.respuestas[SISTEMAS[0].paneles[0].campos[0].id], '10', 'conserva el sistema que ya estaba completo');

  // Carlos sigue respondiendo y lo vuelve a guardar a su nombre
  const siguiente = { ...tomado.datos, respuestas: { ...tomado.datos.respuestas, [preguntas[2].id]: '30' } };
  assert.equal((await carlos.put('/api/progreso', siguiente)).estado, 204);
  assert.equal((await carlos.get('/api/recorridos-abiertos')).datos[0].quedoEn.pregunta, preguntas[3]?.label ?? null);
  await ingeniero.put('/api/ajustes', { permitirTomaRecorridos: false });
});

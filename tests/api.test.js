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
  assert.match(appIng, /<option value="Mixto \(14:00 - 22:00\)">/, 'turnos desde el controlador');
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


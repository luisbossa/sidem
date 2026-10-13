/* Pruebas de la API con una base SQLite en memoria. Ejecutar: npm test */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDatos } from '../server/db/connection.js';
import { crearApp } from '../server/app.js';
import { SISTEMAS } from '../public/js/data/systems.js';

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

/* Informe completo: todos los campos llenos, una no conformidad opcional */
function informeCompleto(noConforme = '') {
  const datos = {};
  for (const s of SISTEMAS) {
    for (const c of s.paneles.flatMap(p => p.campos)) {
      if (c.tipo === 'verificacion') datos[c.id] = c.id === noConforme ? { estado: 'No conforme', detalle: 'Fuga en válvula' } : { estado: 'Conforme', detalle: '' };
      else datos[c.id] = c.tipo === 'textarea' ? 'Sin fallas registradas' : '10';
    }
  }
  return { tipoRecorrido: 'manana', horaInicioISO: new Date(Date.now() - 600000).toISOString(), datos, justificacionesSistemas: {}, ordenRecorrido: SISTEMAS.map(s => s.id) };
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
  const informe = informeCompleto();
  delete informe.datos.nivelDiesel;
  const r = await c.post('/api/inspecciones', informe);
  assert.equal(r.estado, 400);
  assert.equal(r.datos.titulo, 'Informe incompleto');

  informe.datos.fugasIncendio = { estado: 'No conforme', detalle: '' };
  informe.datos.nivelDiesel = '1/2';
  assert.equal((await c.post('/api/inspecciones', informe)).estado, 400, 'No conforme exige detalle');
});

test('flujo completo: envío, devolución, respuesta y aprobación', async () => {
  const tecnico = cliente();
  await tecnico.login('rsalas');
  await tecnico.put('/api/progreso', { inspeccionActiva: { tipoRecorrido: 'manana' }, respuestas: { nivelDiesel: '1/2' } });
  assert.equal((await tecnico.get('/api/progreso')).datos.respuestas.nivelDiesel, '1/2');

  const creado = await tecnico.post('/api/inspecciones', informeCompleto('fugasIncendio'));
  assert.equal(creado.estado, 201);
  const informe = creado.datos;
  assert.equal(informe.resultado, 'Con anomalías');
  assert.equal(informe.estadoRevision, 'Pendiente de revisión');
  assert.equal(informe.inspector, 'Ronald Salas Herrera');
  assert.deepEqual(informe.datos.fugasIncendio, { estado: 'No conforme', detalle: 'Fuga en válvula' });
  assert.equal(informe.ordenRecorrido.length, SISTEMAS.length);
  assert.ok(informe.duracionSegundos >= 599);
  assert.equal((await tecnico.get('/api/progreso')).datos, null, 'el borrador se elimina al enviar');

  assert.equal((await tecnico.post('/api/inspecciones', informeCompleto())).estado, 409, 'un recorrido de mañana por día');

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
  const informe = { ...informeCompleto(), tipoRecorrido: 'tarde', datos: {}, ordenRecorrido: [] };
  informe.justificacionesSistemas = Object.fromEntries(SISTEMAS.map(s => [s.id, 'Equipo en mantenimiento']));
  const r = await c.post('/api/inspecciones', informe);
  assert.equal(r.estado, 201);
  assert.equal(r.datos.resultado, 'Inspección parcial justificada');
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

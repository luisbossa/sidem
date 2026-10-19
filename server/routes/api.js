/* Rutas de la API REST (/api). Cada ruta: middleware de permisos → controlador. */
import { Router } from 'express';
import { requiereSesion, requiereSupervisar, requiereInspeccionar } from '../middleware/auth.js';
import { sinCache } from '../middleware/security-headers.js';
import { noEncontrado } from '../utils/errors.js';
import { crearControladorAuth } from '../controllers/auth.js';
import { crearControladorDatos } from '../controllers/data.js';
import { crearControladorUsuarios } from '../controllers/users.js';
import { crearControladorCronograma } from '../controllers/schedule.js';
import { crearControladorInspecciones } from '../controllers/inspections.js';
import { crearControladorCancelaciones } from '../controllers/cancellations.js';
import { crearControladorRecorridos } from '../controllers/route-drafts.js';
import { crearControladorAjustes } from '../controllers/settings.js';

export function rutasApi(modelos) {
  const auth = crearControladorAuth(modelos);
  const datos = crearControladorDatos(modelos);
  const usuarios = crearControladorUsuarios(modelos);
  const cronograma = crearControladorCronograma(modelos);
  const inspecciones = crearControladorInspecciones(modelos);
  const cancelaciones = crearControladorCancelaciones(modelos);
  const recorridos = crearControladorRecorridos(modelos);
  const ajustesGenerales = crearControladorAjustes(modelos);

  // "ingeniero": revisar y administrar (Ingeniero Supervisor y Supervisor Técnico)
  // "inspector": hacer recorridos (Técnico Inspector y Supervisor Técnico)
  const ingeniero = requiereSupervisar;
  const inspector = requiereInspeccionar;

  const api = Router();
  api.use(sinCache);

  // Sesión
  api.post('/auth/login', auth.login);
  api.post('/auth/logout', auth.logout);
  api.get('/auth/sesion', requiereSesion, auth.sesion);
  api.put('/auth/contrasena', requiereSesion, auth.cambiarContrasena);

  // Carga inicial de la app
  api.get('/datos', requiereSesion, datos.obtener);

  // Usuarios
  api.get('/usuarios', ingeniero, usuarios.listar);
  api.post('/usuarios', ingeniero, usuarios.crear);
  api.put('/usuarios/:id', ingeniero, usuarios.actualizar);
  api.delete('/usuarios/:id', ingeniero, usuarios.eliminar);

  // Rol semanal
  api.get('/cronograma', requiereSesion, cronograma.listar);
  api.post('/cronograma', ingeniero, cronograma.crear);
  api.put('/cronograma/:id', ingeniero, cronograma.actualizar);
  api.delete('/cronograma/:id', ingeniero, cronograma.eliminar);

  // Inspecciones
  api.get('/inspecciones', requiereSesion, inspecciones.listar);
  api.get('/inspecciones/:id', requiereSesion, inspecciones.buscar);
  api.post('/inspecciones', inspector, inspecciones.crear);
  api.put('/inspecciones/:id/revision', ingeniero, inspecciones.revisar);
  api.post('/inspecciones/:id/respuesta', inspector, inspecciones.responder);

  // Cancelaciones
  api.get('/cancelaciones', requiereSesion, cancelaciones.listar);
  api.post('/cancelaciones', inspector, cancelaciones.crear);

  // Recorrido en curso (borrador del técnico responsable)
  api.get('/progreso', inspector, recorridos.leer);
  api.post('/progreso/iniciar', inspector, recorridos.iniciar);
  api.put('/progreso', inspector, recorridos.guardar);
  api.delete('/progreso', inspector, recorridos.eliminar);

  // Recorridos sin terminar: otro técnico puede continuarlos si el ingeniero lo habilitó
  api.get('/recorridos-abiertos', requiereSesion, recorridos.listarAbiertos);
  api.post('/recorridos-abiertos/:id/tomar', inspector, recorridos.tomar);

  // Ajustes generales
  api.get('/ajustes', requiereSesion, ajustesGenerales.leer);
  api.put('/ajustes', ingeniero, ajustesGenerales.guardar);

  api.use((req, res, next) => next(noEncontrado('Ruta de la API no encontrada.')));
  return api;
}

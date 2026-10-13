/* Acceso a datos a través de la API del servidor (Express + SQLite).
   - Lecturas (leer*): síncronas, desde una caché en memoria que llena sincronizar().
   - Escrituras: asíncronas; llaman a la API y actualizan la caché con la respuesta del servidor.
   Ningún otro módulo usa fetch: este archivo es el único punto de acceso a los datos. */
import { URL_LOGIN } from '../core/paths.js';

const cache = {
  usuarios: [],
  cronograma: [],
  registros: [],
  cancelaciones: [],
  progreso: null
};

/* Error de la API con mensaje y título listos para mostrar al usuario */
export class ErrorApi extends Error {
  constructor(mensaje, { estado = 0, titulo = '' } = {}) {
    super(mensaje);
    this.estado = estado;
    this.titulo = titulo;
  }
}

async function api(metodo, ruta, cuerpo, { redirigirSiNoHaySesion = true, keepalive = false } = {}) {
  let respuesta;
  try {
    respuesta = await fetch('/api' + ruta, {
      method: metodo,
      headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'same-origin',
      keepalive
    });
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor. Verifique la red e intente de nuevo.', { titulo: 'Sin conexión' });
  }

  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);
  if (respuesta.ok) return datos;

  if (respuesta.status === 401 && redirigirSiNoHaySesion) {
    location.replace(URL_LOGIN);
  }
  throw new ErrorApi(datos?.error || `Error del servidor (${respuesta.status}).`, { estado: respuesta.status, titulo: datos?.titulo || '' });
}

/* Reemplaza (o agrega al inicio) un elemento de una lista de la caché */
function reemplazar(lista, elemento) {
  const i = lista.findIndex(x => x.id === elemento.id);
  if (i === -1) lista.unshift(elemento);
  else lista[i] = elemento;
}

/* Sesión */
export async function obtenerSesion() {
  try {
    const { usuario } = await api('GET', '/auth/sesion', undefined, { redirigirSiNoHaySesion: false });
    return usuario;
  } catch (e) {
    if (e.estado === 401) return null;
    throw e;
  }
}

export async function iniciarSesionApi(usuario, password) {
  const { usuario: datos } = await api('POST', '/auth/login', { usuario, password }, { redirigirSiNoHaySesion: false });
  return datos;
}

export async function cerrarSesionApi() {
  await api('POST', '/auth/logout', undefined, { redirigirSiNoHaySesion: false });
}

/* Carga todos los datos permitidos para el rol de la sesión. Devuelve el usuario de la sesión. */
export async function sincronizar() {
  const datos = await api('GET', '/datos');
  cache.usuarios = datos.usuarios;
  cache.cronograma = datos.cronograma;
  cache.registros = datos.registros;
  cache.cancelaciones = datos.cancelaciones;
  // No pisa un borrador local que todavía no se envió al servidor
  if (!progresoPendiente) cache.progreso = datos.progreso;
  return datos.usuario;
}

/* Usuarios (solo ingeniero) */
export const leerUsuarios = () => cache.usuarios;

export async function guardarUsuario(datos) {
  const guardado = datos.id
    ? await api('PUT', '/usuarios/' + encodeURIComponent(datos.id), datos)
    : await api('POST', '/usuarios', datos);
  reemplazar(cache.usuarios, guardado);
  return guardado;
}

/* Rol semanal */
export const leerCronograma = () => cache.cronograma;

export function obtenerSemanaVigente() {
  const hoyStr = new Date().toISOString().slice(0, 10);
  return cache.cronograma.find(c => hoyStr >= c.inicio && hoyStr <= c.fin) || null;
}

export async function guardarSemana(datos) {
  const guardada = datos.id
    ? await api('PUT', '/cronograma/' + encodeURIComponent(datos.id), datos)
    : await api('POST', '/cronograma', datos);
  reemplazar(cache.cronograma, guardada);
  return guardada;
}

export async function eliminarSemana(id) {
  await api('DELETE', '/cronograma/' + encodeURIComponent(id));
  cache.cronograma = cache.cronograma.filter(c => c.id !== id);
}

/* Informes de inspección */
export const leerRegistros = () => cache.registros;

export async function crearInspeccion(informe) {
  const creado = await api('POST', '/inspecciones', informe);
  reemplazar(cache.registros, creado);
  cache.progreso = null;
  return creado;
}

export async function revisarInspeccion(id, estadoRevision, observaciones) {
  const actualizado = await api('PUT', `/inspecciones/${encodeURIComponent(id)}/revision`, { estadoRevision, observaciones });
  reemplazar(cache.registros, actualizado);
  return actualizado;
}

export async function responderInspeccion(id, texto) {
  const actualizado = await api('POST', `/inspecciones/${encodeURIComponent(id)}/respuesta`, { texto });
  reemplazar(cache.registros, actualizado);
  return actualizado;
}

/* Recorridos cancelados */
export const leerCancelaciones = () => cache.cancelaciones;

export async function crearCancelacion(datos) {
  const creada = await api('POST', '/cancelaciones', datos);
  reemplazar(cache.cancelaciones, creada);
  cache.progreso = null;
  return creada;
}

/* Recorrido en curso: se guarda en el servidor con una pequeña espera para agrupar cambios */
let temporizadorProgreso = null;
let progresoPendiente = false;

export const leerProgreso = () => cache.progreso;

function enviarProgreso(keepalive = false) {
  clearTimeout(temporizadorProgreso);
  if (!progresoPendiente) return Promise.resolve();
  progresoPendiente = false;
  const datos = cache.progreso;
  const peticion = datos ? api('PUT', '/progreso', datos, { keepalive }) : api('DELETE', '/progreso', undefined, { keepalive });
  return peticion.catch(e => console.warn('[SIDEM] No se pudo guardar el recorrido en curso:', e.message));
}

export function guardarProgreso(datos) {
  cache.progreso = datos;
  progresoPendiente = true;
  clearTimeout(temporizadorProgreso);
  temporizadorProgreso = setTimeout(enviarProgreso, 400);
}

export function eliminarProgreso() {
  cache.progreso = null;
  progresoPendiente = true;
  return enviarProgreso();
}

/* Envía el borrador pendiente si se cierra o recarga la página */
addEventListener('pagehide', () => enviarProgreso(true));

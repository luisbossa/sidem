/* Token de sesión en cookie httpOnly. En la base (modelo Sesiones) solo se guarda su hash SHA-256. */
import crypto from 'node:crypto';
import { config } from '../config.js';

export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

export function leerToken(req) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const [clave, ...resto] = parte.trim().split('=');
    if (clave === config.nombreCookie) return decodeURIComponent(resto.join('='));
  }
  return '';
}

const opcionesCookie = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSegura,
  path: '/'
});

export function abrirSesion(sesiones, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ahora = new Date();
  const duracionMs = config.duracionSesionHoras * 3600 * 1000;
  sesiones.crear(hashToken(token), usuarioId, ahora.toISOString(), new Date(ahora.getTime() + duracionMs).toISOString());
  res.cookie(config.nombreCookie, token, { ...opcionesCookie(), maxAge: duracionMs });
}

export function cerrarSesion(sesiones, req, res) {
  const token = leerToken(req);
  if (token) sesiones.eliminar(hashToken(token));
  res.clearCookie(config.nombreCookie, opcionesCookie());
}

/* Cierra las sesiones de un usuario (al desactivarlo o cambiar su contraseña o rol).
   Si es el mismo usuario de la petición, conserva su sesión actual. */
export function cerrarSesionesDeUsuario(sesiones, usuarioId, req = null) {
  const actual = req ? leerToken(req) : '';
  sesiones.eliminarDeUsuario(usuarioId, actual ? hashToken(actual) : '');
}

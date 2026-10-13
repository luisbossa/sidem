/* Middlewares de sesión y permisos. */
import { leerToken, hashToken } from '../security/sessions.js';
import { noAutenticado, prohibido } from '../utils/errors.js';

/* Si la cookie corresponde a una sesión vigente de un usuario activo, deja req.usuario
   (y res.locals.usuario para las vistas EJS) */
export function cargarSesion(modelos) {
  return (req, res, next) => {
    const token = leerToken(req);
    req.usuario = token ? modelos.sesiones.buscarUsuario(hashToken(token), new Date().toISOString()) : null;
    res.locals.usuario = req.usuario;
    next();
  };
}

/* API: responde 401 si no hay sesión */
export function requiereSesion(req, res, next) {
  if (!req.usuario) return next(noAutenticado());
  next();
}

/* API: responde 403 si el rol no corresponde */
export const requiereRol = rol => (req, res, next) => {
  if (!req.usuario) return next(noAutenticado());
  if (req.usuario.rol !== rol) {
    return next(prohibido(rol === 'ingeniero'
      ? 'Esta acción es exclusiva del Ingeniero Supervisor.'
      : 'Esta acción es exclusiva del Técnico Inspector.'));
  }
  next();
};

/* Páginas: sin sesión redirige al inicio de sesión */
export function requiereSesionPagina(req, res, next) {
  if (!req.usuario) return res.redirect('/login');
  next();
}

/* Páginas: con sesión, el login redirige a la aplicación */
export function soloSinSesion(req, res, next) {
  if (req.usuario) return res.redirect('/app');
  next();
}

/* Manejo central de errores: JSON para la API y una vista EJS para las páginas. */
import { ErrorHttp } from '../utils/errors.js';

function describir(err) {
  if (err instanceof ErrorHttp) return { estado: err.estado, mensaje: err.message, titulo: err.titulo };
  if (err.type === 'entity.parse.failed') return { estado: 400, mensaje: 'El cuerpo de la solicitud no es JSON válido.' };
  if (err.type === 'entity.too.large') return { estado: 413, mensaje: 'La solicitud es demasiado grande.' };
  if (/constraint failed/i.test(err.message || '')) {
    console.warn('[SIDEM] Restricción de la base de datos:', err.message);
    return { estado: 409, mensaje: 'Los datos entran en conflicto con un registro existente.' };
  }
  console.error('[SIDEM] Error no controlado:', err);
  return { estado: 500, mensaje: 'Error interno del servidor.' };
}

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  const { estado, mensaje, titulo } = describir(err);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(estado).json({ error: mensaje, titulo: titulo || undefined });
  }
  res.status(estado).render('pages/error', {
    layout: 'layouts/auth',
    tituloPagina: titulo || 'Error',
    estado,
    mensaje
  });
}

/* Página no encontrada (después de las rutas y los archivos estáticos) */
export function paginaNoEncontrada(req, res) {
  res.status(404).render('pages/error', {
    layout: 'layouts/auth',
    tituloPagina: 'Página no encontrada',
    estado: 404,
    mensaje: 'La dirección que buscó no existe en el sistema.'
  });
}

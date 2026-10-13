/* Errores HTTP con mensaje (y título opcional) listos para mostrar al usuario.
   Se convierten en respuesta en middleware/error-handler.js. */
export class ErrorHttp extends Error {
  constructor(estado, mensaje, titulo = '') {
    super(mensaje);
    this.estado = estado;
    this.titulo = titulo;
  }
}

export const solicitudInvalida = (mensaje, titulo) => new ErrorHttp(400, mensaje, titulo);
export const noAutenticado = (mensaje = 'Su sesión no está iniciada o ya venció.', titulo) => new ErrorHttp(401, mensaje, titulo);
export const prohibido = (mensaje = 'No tiene permiso para realizar esta acción.', titulo) => new ErrorHttp(403, mensaje, titulo);
export const noEncontrado = (mensaje = 'El registro solicitado no existe.', titulo) => new ErrorHttp(404, mensaje, titulo);
export const conflicto = (mensaje, titulo) => new ErrorHttp(409, mensaje, titulo);
export const demasiadosIntentos = (mensaje, titulo) => new ErrorHttp(429, mensaje, titulo);

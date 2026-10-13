/* Configuración del servidor. Todo se puede cambiar con variables de entorno. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  raiz,
  puerto: Number(process.env.PORT) || 3000,
  // Archivo SQLite (se crea con sus tablas y datos iniciales si no existe)
  rutaBaseDatos: process.env.SIDEM_DB || path.join(raiz, 'data', 'sidem.db'),
  carpetaPublica: path.join(raiz, 'public'),
  nombreCookie: 'sidem_sesion',
  duracionSesionHoras: Number(process.env.SIDEM_SESION_HORAS) || 12,
  // Activar (=1) cuando el sistema se sirva por HTTPS
  cookieSegura: process.env.SIDEM_COOKIE_SEGURA === '1',
  // Intentos fallidos de inicio de sesión antes de bloquear temporalmente
  maxIntentosLogin: 5,
  minutosBloqueoLogin: 5
};

/* Configuración del servidor. Todo se puede cambiar con variables de entorno. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// En Vercel el disco del proyecto es de solo lectura: solo /tmp admite escritura
const enVercel = Boolean(process.env.VERCEL);

export const config = {
  raiz,
  enVercel,
  puerto: Number(process.env.PORT) || 3000,
  // Archivo SQLite (se crea con sus tablas y datos iniciales si no existe)
  rutaBaseDatos: process.env.SIDEM_DB || (enVercel ? '/tmp/sidem.db' : path.join(raiz, 'data', 'sidem.db')),
  carpetaPublica: path.join(raiz, 'public'),
  nombreCookie: 'sidem_sesion',
  duracionSesionHoras: Number(process.env.SIDEM_SESION_HORAS) || 12,
  // Activar (=1) cuando el sistema se sirva por HTTPS
  cookieSegura: process.env.SIDEM_COOKIE_SEGURA === '1' || (enVercel && process.env.SIDEM_COOKIE_SEGURA !== '0'),
  // Intentos fallidos de inicio de sesión antes de bloquear temporalmente
  maxIntentosLogin: 5,
  minutosBloqueoLogin: 5
};

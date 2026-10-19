/* Configuración del servidor. Todo se puede cambiar con variables de entorno. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// En Vercel el disco del proyecto es de solo lectura: solo /tmp admite escritura
const enVercel = Boolean(process.env.VERCEL);
// En IIS, iisnode define IISNODE_VERSION y entrega en PORT una tubería con nombre (\\.\pipe\...), no un número
const enIIS = Boolean(process.env.IISNODE_VERSION);

// Archivo SQLite (se crea con sus tablas y datos iniciales si no existe)
const rutaBaseDatos = process.env.SIDEM_DB || (enVercel ? '/tmp/sidem.db' : path.join(raiz, 'data', 'sidem.db'));

export const config = {
  raiz,
  enVercel,
  // Detrás de un proxy (Vercel o IIS) la IP real del cliente llega en X-Forwarded-For
  detrasDeProxy: enVercel || enIIS,
  puerto: process.env.PORT || 3000,
  rutaBaseDatos,
  carpetaPublica: path.join(raiz, 'public'),
  // Fotos de los recorridos: junto a la base de datos (en IIS, la carpeta data ya tiene permiso de escritura)
  carpetaFotos: process.env.SIDEM_FOTOS || path.join(path.dirname(rutaBaseDatos), 'fotos'),
  nombreCookie: 'sidem_sesion',
  duracionSesionHoras: Number(process.env.SIDEM_SESION_HORAS) || 12,
  // Activar (=1) cuando el sistema se sirva por HTTPS
  cookieSegura: process.env.SIDEM_COOKIE_SEGURA === '1' || (enVercel && process.env.SIDEM_COOKIE_SEGURA !== '0'),
  // Intentos fallidos de inicio de sesión antes de bloquear temporalmente
  maxIntentosLogin: 5,
  minutosBloqueoLogin: 5
};

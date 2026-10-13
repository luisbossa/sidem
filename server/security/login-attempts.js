/* Bloqueo temporal tras varios intentos fallidos de inicio de sesión (por usuario + IP). */
import { config } from '../config.js';
import { demasiadosIntentos } from '../utils/errors.js';

const intentos = new Map();

export function verificarBloqueo(clave) {
  const registro = intentos.get(clave);
  if (registro && registro.bloqueadoHasta > Date.now()) {
    const minutos = Math.ceil((registro.bloqueadoHasta - Date.now()) / 60000);
    throw demasiadosIntentos(`Demasiados intentos fallidos. Espere ${minutos} minuto(s) e intente de nuevo.`, 'Acceso bloqueado temporalmente');
  }
}

export function registrarFallo(clave) {
  const registro = intentos.get(clave) || { fallos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= config.maxIntentosLogin) {
    registro.fallos = 0;
    registro.bloqueadoHasta = Date.now() + config.minutosBloqueoLogin * 60000;
  }
  intentos.set(clave, registro);
}

export function limpiarIntentos(clave) {
  intentos.delete(clave);
}

/* Cambio de la contraseña propia (cualquier usuario, desde la barra superior). */
import { cambiarContrasenaApi } from '../data/storage.js';
import { mostrarAlertaVisual, solicitarCambioContrasena } from '../ui/dialogs.js';

// Debe coincidir con MIN_CONTRASENA_PROPIA en server/controllers/auth.js
const MINIMO_CARACTERES = 6;

export async function cambiarContrasena() {
  const cambiada = await solicitarCambioContrasena(MINIMO_CARACTERES, cambiarContrasenaApi);
  if (!cambiada) return;
  await mostrarAlertaVisual('Contraseña actualizada', 'Su contraseña se cambió correctamente. Úsela la próxima vez que inicie sesión. Las sesiones abiertas en otros equipos se cerraron.', 'exito');
}

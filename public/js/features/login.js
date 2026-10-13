/* Página de inicio de sesión: el servidor valida las credenciales y abre la sesión. */
import { $ } from '../core/dom.js';
import { URL_APP } from '../core/paths.js';
import { iniciarSesionApi } from '../data/storage.js';
import { mostrarAlertaVisual } from '../ui/dialogs.js';

let enviando = false;

export async function iniciarSesion(e) {
  if (e) e.preventDefault();
  if (enviando) return;
  const usuarioInput = $('inputNombreUsuario').value.trim();
  const passwordInput = $('inputPasswordUsuario').value;

  if (!usuarioInput || !passwordInput) {
    await mostrarAlertaVisual('Datos Incompletos', 'Por favor ingrese su usuario y contraseña.', 'advertencia');
    return;
  }

  const boton = document.querySelector('.login-submit');
  enviando = true;
  boton.disabled = true;
  try {
    await iniciarSesionApi(usuarioInput, passwordInput);
    location.replace(URL_APP);
  } catch (error) {
    $('inputPasswordUsuario').value = '';
    await mostrarAlertaVisual(error.titulo || 'No se pudo iniciar sesión', error.message, 'advertencia');
    $('inputPasswordUsuario').focus();
  } finally {
    enviando = false;
    boton.disabled = false;
  }
}

/* Botón de ojo del campo contraseña. */
export function alternarVisibilidadPassword() {
  const input = $('inputPasswordUsuario');
  const boton = document.querySelector('[data-action="toggle-password"]');
  const mostrar = input.type === 'password';
  input.type = mostrar ? 'text' : 'password';
  boton.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  boton.setAttribute('aria-pressed', String(mostrar));
}

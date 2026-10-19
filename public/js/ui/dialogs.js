/* Diálogos asíncronos: alerta, confirmación y justificación de cancelación.
   El parámetro "tipo" se mantiene en español ('advertencia' | 'exito' | 'info')
   y aquí se traduce a la clase CSS correspondiente. */
import { $ } from '../core/dom.js';
import { icono as iconoSvg } from './icons.js';

const CLASE_POR_TIPO = { advertencia: 'warning', exito: 'success', info: 'info' };

/* "icono" es el nombre de un icono de icons.js */
function prepararDialogo(tipo, icono, titulo) {
  $('cajaDialogo').className = `dialog-box ${CLASE_POR_TIPO[tipo] || 'info'}`;
  $('dialogoIcono').innerHTML = iconoSvg(icono);
  $('dialogoTitulo').textContent = titulo;
}

function abrirDialogo() {
  $('modalDialogo').classList.remove('hidden');
}

function cerrarDialogo() {
  $('modalDialogo').classList.add('hidden');
}

export function mostrarAlertaVisual(titulo, mensaje, tipo = 'info') {
  return new Promise(resolve => {
    const icono = tipo === 'advertencia' ? 'alerta' : (tipo === 'exito' ? 'exito' : 'info');
    prepararDialogo(tipo, icono, titulo);
    $('dialogoMensaje').textContent = mensaje;
    $('dialogoBotones').innerHTML = `<button id="btnDialogoAceptar" type="button" class="btn btn-primary btn-block">Entendido</button>`;

    $('btnDialogoAceptar').onclick = () => {
      cerrarDialogo();
      resolve();
    };
    abrirDialogo();
  });
}

export function mostrarConfirmacionVisual(titulo, mensaje, textoConfirmar = 'Sí, continuar', tipo = 'advertencia') {
  return new Promise(resolve => {
    prepararDialogo(tipo, tipo === 'advertencia' ? 'alerta' : 'pregunta', titulo);
    $('dialogoMensaje').textContent = mensaje;

    const claseBoton = tipo === 'advertencia' ? 'btn-red' : 'btn-primary';
    $('dialogoBotones').innerHTML = `
      <button id="btnDialogoCancelar" type="button" class="btn btn-secondary">Cancelar</button>
      <button id="btnDialogoConfirmar" type="button" class="btn ${claseBoton}">${textoConfirmar}</button>`;

    $('btnDialogoCancelar').onclick = () => {
      cerrarDialogo();
      resolve(false);
    };
    $('btnDialogoConfirmar').onclick = () => {
      cerrarDialogo();
      resolve(true);
    };
    abrirDialogo();
  });
}

export function solicitarJustificacionCancelacion() {
  return new Promise(resolve => {
    prepararDialogo('advertencia', 'alerta', 'Justificación obligatoria');
    $('dialogoMensaje').innerHTML = `
      <label for="txtJustificacionCancelacion">Para cancelar el recorrido debe explicar el motivo.</label>
      <textarea id="txtJustificacionCancelacion" class="dialog-textarea" rows="4" maxlength="500" placeholder="Digite la razón por la que no puede continuar..."></textarea>
      <small id="errorJustificacionCancelacion" class="dialog-error hidden">Debe escribir una justificación válida.</small>`;
    $('dialogoBotones').innerHTML = `
      <button id="btnContinuarRecorrido" type="button" class="btn btn-secondary">Continuar recorrido</button>
      <button id="btnConfirmarCancelacion" type="button" class="btn btn-red">Cancelar recorrido</button>`;

    $('btnContinuarRecorrido').onclick = () => {
      cerrarDialogo();
      resolve(null);
    };
    $('btnConfirmarCancelacion').onclick = () => {
      const texto = $('txtJustificacionCancelacion').value.trim();
      if (texto.length < 5) {
        $('errorJustificacionCancelacion').classList.remove('hidden');
        $('txtJustificacionCancelacion').focus();
        return;
      }
      cerrarDialogo();
      resolve(texto);
    };
    abrirDialogo();
    // El diálogo pudo cerrarse antes de enfocar el campo
    setTimeout(() => {
      const campo = $('txtJustificacionCancelacion');
      if (campo) campo.focus();
    }, 50);
  });
}

/* Formulario dentro del diálogo.
   - campos: [{ id, etiqueta, tipo, autocomplete, ayuda }] (los ids se usan tal cual en el HTML)
   - leer(valores): valida en el navegador; devuelve un mensaje de error o '' si todo está bien
   - verificar(valores): asíncrona; si lanza un error el diálogo sigue abierto y muestra el mensaje
   Resuelve con el resultado de verificar, o null si se cancela. */
function formularioEnDialogo({ titulo, icono, mensaje, campos, textoConfirmar, leer = () => '', verificar }) {
  return new Promise(resolve => {
    prepararDialogo('info', icono, titulo);
    $('dialogoMensaje').innerHTML = `
      <form id="formDialogo" class="form dialog-form" novalidate>
        <p id="txtFormDialogoMensaje"></p>
        ${campos.map(c => `
          <div class="form-field">
            <label for="${c.id}"></label>
            <input id="${c.id}" type="${c.tipo || 'text'}" autocomplete="${c.autocomplete || 'off'}" autocapitalize="none" spellcheck="false" maxlength="128" />
            ${c.ayuda ? `<small id="${c.id}Ayuda"></small>` : ''}
          </div>`).join('')}
        <small id="errorFormDialogo" class="dialog-error hidden" role="alert"></small>
      </form>`;
    // Los textos se asignan con textContent para no interpretarlos como HTML
    $('txtFormDialogoMensaje').textContent = mensaje;
    campos.forEach(c => {
      document.querySelector(`label[for="${c.id}"]`).textContent = c.etiqueta;
      if (c.ayuda) $(`${c.id}Ayuda`).textContent = c.ayuda;
    });
    $('dialogoBotones').innerHTML = `
      <button id="btnFormDialogoCancelar" type="button" class="btn btn-secondary">Cancelar</button>
      <button id="btnFormDialogoConfirmar" type="submit" form="formDialogo" class="btn btn-primary"></button>`;
    $('btnFormDialogoConfirmar').textContent = textoConfirmar;

    const mostrarError = texto => {
      $('errorFormDialogo').textContent = texto;
      $('errorFormDialogo').classList.remove('hidden');
    };
    const valores = () => Object.fromEntries(campos.map(c => [c.id, $(c.id).value]));

    $('btnFormDialogoCancelar').onclick = () => {
      cerrarDialogo();
      resolve(null);
    };
    $('formDialogo').onsubmit = async e => {
      e.preventDefault();
      const datos = valores();
      const error = leer(datos);
      if (error) {
        mostrarError(error);
        return;
      }
      const boton = $('btnFormDialogoConfirmar');
      boton.disabled = true;
      try {
        const resultado = await verificar(datos);
        cerrarDialogo();
        resolve(resultado);
      } catch (err) {
        mostrarError(err.message);
        // Se borran las contraseñas escritas para volver a intentarlo
        campos.filter(c => c.tipo === 'password').forEach(c => { $(c.id).value = ''; });
        const primeraClave = campos.find(c => c.tipo === 'password');
        if (primeraClave) $(primeraClave.id).focus();
      } finally {
        boton.disabled = false;
      }
    };
    abrirDialogo();
    setTimeout(() => {
      const campo = $(campos[0].id);
      if (campo) campo.focus();
    }, 50);
  });
}

/* Pide usuario y contraseña (por ejemplo, para continuar el recorrido de otro técnico) */
export function solicitarCredenciales(titulo, mensaje, verificar, textoConfirmar = 'Confirmar') {
  return formularioEnDialogo({
    titulo,
    icono: 'usuarios',
    mensaje,
    textoConfirmar,
    campos: [
      { id: 'txtCredencialUsuario', etiqueta: 'Su usuario', autocomplete: 'username' },
      { id: 'txtCredencialPassword', etiqueta: 'Su contraseña', tipo: 'password', autocomplete: 'current-password' }
    ],
    leer: v => (v.txtCredencialUsuario.trim() && v.txtCredencialPassword ? '' : 'Escriba su usuario y su contraseña.'),
    verificar: v => verificar(v.txtCredencialUsuario.trim(), v.txtCredencialPassword)
  });
}

/* Pide la contraseña actual y la nueva dos veces. "verificar(actual, nueva)" la cambia en el servidor. */
export function solicitarCambioContrasena(minimo, verificar) {
  return formularioEnDialogo({
    titulo: 'Cambiar contraseña',
    icono: 'candado',
    mensaje: 'Por seguridad, escriba primero su contraseña actual. Al cambiarla se cerrarán sus sesiones abiertas en otros equipos.',
    textoConfirmar: 'Cambiar contraseña',
    campos: [
      { id: 'txtContrasenaActual', etiqueta: 'Contraseña actual', tipo: 'password', autocomplete: 'current-password' },
      { id: 'txtContrasenaNueva', etiqueta: 'Contraseña nueva', tipo: 'password', autocomplete: 'new-password', ayuda: `Al menos ${minimo} caracteres y distinta de la actual.` },
      { id: 'txtContrasenaConfirmar', etiqueta: 'Repita la contraseña nueva', tipo: 'password', autocomplete: 'new-password' }
    ],
    leer: v => {
      if (!v.txtContrasenaActual || !v.txtContrasenaNueva || !v.txtContrasenaConfirmar) return 'Complete los tres campos.';
      if (v.txtContrasenaNueva.length < minimo) return `La contraseña nueva debe tener al menos ${minimo} caracteres.`;
      if (v.txtContrasenaNueva !== v.txtContrasenaConfirmar) return 'La contraseña nueva y su confirmación no coinciden.';
      if (v.txtContrasenaNueva === v.txtContrasenaActual) return 'La contraseña nueva debe ser distinta de la actual.';
      return '';
    },
    verificar: v => verificar(v.txtContrasenaActual, v.txtContrasenaNueva).then(() => true)
  });
}

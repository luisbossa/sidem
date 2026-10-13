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

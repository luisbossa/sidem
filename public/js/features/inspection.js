/* Recorrido del inspector: inicio, listado de sistemas, captura, validación, envío y cancelación. */
import { $, escapar } from '../core/dom.js';
import { estado } from '../core/state.js';
import { claveFechaLocal } from '../core/format.js';
import { SISTEMAS } from '../data/systems.js';
import { leerRegistros, crearInspeccion, crearCancelacion, guardarProgreso, eliminarProgreso } from '../data/storage.js';
import { mostrarAlertaVisual, solicitarJustificacionCancelacion } from '../ui/dialogs.js';
import { mostrarVista } from '../ui/navigation.js';
import { icono } from '../ui/icons.js';
import { actualizarBloqueoNavegacionTecnico } from './session.js';

/* Clave interna del estado → clase CSS */
const CLASE_ESTADO_SISTEMA = {
  pendiente: 'status-pending',
  proceso: 'status-progress',
  completo: 'status-complete',
  justificado: 'status-justified'
};

let enviandoInforme = false;

/* Recorridos diarios (mañana / tarde) */
function recorridoRealizadoHoy(tipo) {
  if (!estado.usuarioSesion) return false;
  const hoy = claveFechaLocal(new Date());
  return leerRegistros().some(r =>
    r.inspectorId === estado.usuarioSesion.id &&
    r.tipoRecorrido === tipo &&
    claveFechaLocal(r.horaFinISO || r.fechaISO || r.horaInicioISO) === hoy
  );
}

export function actualizarOpcionesRecorridoDiario() {
  if (!estado.usuarioSesion || estado.usuarioSesion.rol !== 'inspector') return;
  const mananaCompleta = recorridoRealizadoHoy('manana');
  const tardeCompleta = recorridoRealizadoHoy('tarde');
  const btnManana = $('btnRecorridoManana');
  const btnTarde = $('btnRecorridoTarde');
  if (!btnManana || !btnTarde) return;

  btnManana.disabled = mananaCompleta;
  btnTarde.disabled = tardeCompleta;
  btnManana.classList.toggle('completed', mananaCompleta);
  btnTarde.classList.toggle('completed', tardeCompleta);
  $('estadoRecorridoManana').textContent = mananaCompleta ? 'Completado hoy · disponible mañana' : 'Disponible';
  $('estadoRecorridoTarde').textContent = tardeCompleta ? 'Completado hoy · disponible mañana' : 'Disponible';
  $('estadoRecorridosDia').textContent = mananaCompleta && tardeCompleta
    ? 'Los dos recorridos obligatorios de hoy fueron completados.'
    : `Recorridos completados hoy: ${Number(mananaCompleta) + Number(tardeCompleta)} de 2.`;
}

export async function iniciarInspeccion(tipoRecorrido) {
  if (!estado.usuarioSesion || estado.usuarioSesion.rol !== 'inspector') {
    await mostrarAlertaVisual('Acceso Restringido', 'Solo el usuario con rol de Inspector puede iniciar la inspección diaria.', 'advertencia');
    return;
  }
  if (!['manana', 'tarde'].includes(tipoRecorrido)) return;
  if (recorridoRealizadoHoy(tipoRecorrido)) {
    await mostrarAlertaVisual('Recorrido ya completado', `El recorrido de la ${tipoRecorrido === 'manana' ? 'mañana' : 'tarde'} ya fue enviado hoy. Estará disponible nuevamente mañana.`, 'advertencia');
    actualizarOpcionesRecorridoDiario();
    return;
  }

  const ahora = new Date();
  estado.inspeccionActiva = {
    id: 'insp-' + Date.now(),
    inspector: estado.usuarioSesion.nombre,
    tipoRecorrido,
    fechaISO: ahora.toISOString(),
    horaInicioISO: ahora.toISOString()
  };
  estado.respuestas = {};
  estado.justificacionesSistemas = {};
  estado.ordenRecorrido = [];
  estado.mostrarJustificacionesPendientes = false;
  estado.pasoActual = 0;
  guardarEstadoEnProgreso();
  $('estadoCabecera').textContent = 'Inspección en curso';
  actualizarBloqueoNavegacionTecnico();
  mostrarVista('inspeccion');
  iniciarCronometro();
  mostrarListadoSistemas();
}

/* Colores del sistema activo */
function aplicarColores(c) {
  const raiz = document.documentElement.style;
  raiz.setProperty('--theme', c.tema);
  raiz.setProperty('--theme-dark', c.oscuro);
  raiz.setProperty('--theme-border', c.borde);
  raiz.setProperty('--theme-bg', c.fondo);
  raiz.setProperty('--theme-header-text', c.textoCabecera || '#ffffff');
}

/* Estado de cada sistema */
function camposDelSistema(sistema) {
  return sistema.paneles.flatMap(p => p.campos).filter(c => c.id !== 'observacionesFinales');
}

function valorTieneContenido(valor) {
  if (valor && typeof valor === 'object') return Boolean(valor.estado || valor.detalle);
  return Boolean(String(valor ?? '').trim());
}

function campoEstaCompleto(campo) {
  const valor = estado.respuestas[campo.id];
  if (campo.tipo === 'verificacion') {
    return Boolean(valor && valor.estado && (valor.estado !== 'No conforme' || String(valor.detalle || '').trim()));
  }
  return Boolean(String(valor ?? '').trim());
}

function obtenerEstadoSistema(sistema) {
  const campos = camposDelSistema(sistema);
  const completos = campos.filter(campoEstaCompleto).length;
  const conDatos = campos.filter(c => valorTieneContenido(estado.respuestas[c.id])).length;
  const completo = completos === campos.length;
  const justificacion = String(estado.justificacionesSistemas[sistema.id] || '').trim();
  const base = { completos, total: campos.length };

  if (completo) return { ...base, clave: 'completo', texto: 'Completado', icono: 'check', completo: true, justificado: false };
  if (justificacion) return { ...base, clave: 'justificado', texto: 'No completado · Justificado', icono: 'alerta', completo: false, justificado: true };
  if (conDatos > 0) return { ...base, clave: 'proceso', texto: 'En proceso', icono: 'reloj', completo: false, justificado: false };
  return { ...base, clave: 'pendiente', texto: 'Pendiente', icono: 'circulo', completo: false, justificado: false };
}

function hayRecorridoSinResolver() {
  return SISTEMAS.some(s => {
    const e = obtenerEstadoSistema(s);
    return !e.completo && !e.justificado;
  });
}

/* Listado de sistemas */
export function mostrarListadoSistemas(mostrarAlerta = false) {
  $('vistaListadoSistemas').classList.remove('hidden');
  $('vistaFormularioSistema').classList.add('hidden');
  aplicarColores({ tema: '#1d4ed8', oscuro: '#1e40af', borde: '#1e40af', fondo: '#f8fafc', textoCabecera: '#ffffff' });
  const tipo = estado.inspeccionActiva && estado.inspeccionActiva.tipoRecorrido;
  $('tituloTipoRecorrido').innerHTML = tipo === 'tarde' ? `${icono('atardecer')} Recorrido de la tarde` : `${icono('sol')} Recorrido de la mañana`;
  renderizarListadoSistemas(mostrarAlerta);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderizarListadoSistemas(mostrarAlerta = false) {
  const estados = SISTEMAS.map(obtenerEstadoSistema);
  const alerta = $('alertaListado');
  if (mostrarAlerta) {
    const sinResolver = estados.filter(e => !e.completo && !e.justificado).length;
    alerta.innerHTML = `<strong>Hay ${sinResolver} sistema(s) incompleto(s).</strong> Se encuentran marcados en rojo. Complete la inspección o escriba la justificación correspondiente.`;
    alerta.classList.remove('hidden');
  } else {
    alerta.classList.add('hidden');
  }

  $('listaSistemasRecorrido').innerHTML = SISTEMAS.map((s, idx) => {
    const e = estados[idx];
    const justificacion = String(estado.justificacionesSistemas[s.id] || '');
    const requiereJustificacion = estado.mostrarJustificacionesPendientes && !e.completo && !e.justificado;
    const claseEstado = requiereJustificacion ? 'status-justified' : CLASE_ESTADO_SISTEMA[e.clave];
    const textoEstado = requiereJustificacion ? `${icono('alerta')} Requiere justificación` : `${icono(e.icono)} ${e.texto}`;
    const textoBoton = e.clave === 'proceso' ? 'Continuar' : e.completo ? 'Revisar' : 'Inspeccionar';
    return `
      <article class="route-system ${requiereJustificacion ? 'route-system-alert' : ''}" style="--system-theme:${s.colores.tema}; --system-border:${s.colores.borde}; --system-bg:${s.colores.fondo};">
        <div class="route-system-main">
          <div class="route-system-name">
            <div class="route-system-icon">${icono(s.icono)}</div>
            <div><h3>${idx + 1}. ${escapar(s.nombre)}</h3><small>${e.completos} de ${e.total} campos completos</small></div>
          </div>
          <span class="system-status ${claseEstado}">${textoEstado}</span>
          <button type="button" class="btn ${e.clave === 'proceso' ? 'btn-primary' : 'btn-secondary'}" data-action="open-system" data-index="${idx}">${textoBoton}</button>
        </div>
        ${requiereJustificacion ? `
          <div class="system-justification">
            <label for="justificacion_${s.id}">${icono('alerta')} Sistema incompleto: ${escapar(s.nombre)}</label>
            <textarea id="justificacion_${s.id}" placeholder="Digite obligatoriamente por qué no realizó o no completó la inspección...">${escapar(justificacion)}</textarea>
            <div class="system-justification-actions">
              <button type="button" class="btn btn-amber btn-xs" data-action="save-justification" data-index="${idx}">Guardar justificación</button>
            </div>
          </div>` : ''}
      </article>`;
  }).join('');
}

export async function guardarJustificacionSistema(idx) {
  const sistema = SISTEMAS[idx];
  const campo = $('justificacion_' + sistema.id);
  const texto = campo ? campo.value.trim() : '';
  if (!texto) {
    await mostrarAlertaVisual('Justificación requerida', `Debe escribir una justificación para ${sistema.nombre}.`, 'advertencia');
    return;
  }
  estado.justificacionesSistemas[sistema.id] = texto;
  guardarEstadoEnProgreso();
  renderizarListadoSistemas(hayRecorridoSinResolver());
}

/* Formulario de un sistema */
export function abrirSistema(idx) {
  if (!estado.inspeccionActiva) return;
  if (!estado.ordenRecorrido.includes(SISTEMAS[idx].id)) estado.ordenRecorrido.push(SISTEMAS[idx].id);
  guardarEstadoEnProgreso();
  renderizarPaso(idx);
}

function plantillaCampo(c) {
  const guardado = estado.respuestas[c.id];
  const ayuda = c.ayuda ? `<small>${escapar(c.ayuda)}</small>` : '';

  if (c.tipo === 'verificacion') {
    const valorEstado = (guardado && typeof guardado === 'object') ? guardado.estado : '';
    const detalle = (guardado && typeof guardado === 'object') ? guardado.detalle : '';
    const esNoConf = valorEstado === 'No conforme';
    /* Botones de opción sin preselección: el técnico debe elegir uno */
    const opcion = (valor, sufijo, clase) => `
      <input type="radio" class="choice-input" name="${c.id}" id="${c.id}_${sufijo}" value="${valor}" data-change="verification-change" ${valorEstado === valor ? 'checked' : ''}>
      <label class="choice ${clase}" for="${c.id}_${sufijo}">${valor}</label>`;
    return `
      <div class="form-field" id="campo_${c.id}">
        <fieldset class="check-field ${esNoConf ? 'non-compliant' : ''}">
          <legend>${escapar(c.label)} *</legend>
          <div class="choice-group">
            ${opcion('Conforme', 'conforme', 'choice-ok')}${opcion('No conforme', 'noconforme', 'choice-bad')}${opcion('No aplica', 'noaplica', 'choice-na')}
          </div>
          <div id="box_${c.id}" class="anomaly-detail ${esNoConf ? '' : 'hidden'}">
            <label for="${c.id}_det">Detalle de la anomalía *</label>
            <textarea id="${c.id}_det" rows="2" placeholder="Describa la anomalía encontrada">${escapar(detalle)}</textarea>
          </div>
        </fieldset>
      </div>`;
  }

  if (c.tipo === 'textarea') {
    const txt = (guardado && typeof guardado === 'string') ? guardado : '';
    return `
      <div class="form-field" id="campo_${c.id}">
        <label for="${c.id}">${escapar(c.label)} *</label>
        <textarea id="${c.id}" rows="3" placeholder="Digite el valor">${escapar(txt)}</textarea>
        ${ayuda}
      </div>`;
  }

  const val = (guardado && typeof guardado === 'string') ? guardado : '';
  return `
    <div class="form-field" id="campo_${c.id}">
      <label for="${c.id}">${escapar(c.label)} *</label>
      ${c.unidad
        ? `<div class="input-group"><input id="${c.id}" type="text" inputmode="decimal" placeholder="Digite el valor" value="${escapar(val)}"><span class="input-addon">${escapar(c.unidad)}</span></div>`
        : `<input id="${c.id}" type="text" placeholder="Digite el valor" value="${escapar(val)}">`}
      ${ayuda}
    </div>`;
}

function renderizarPaso(idx) {
  estado.pasoActual = idx;
  const s = SISTEMAS[idx];
  aplicarColores(s.colores);
  $('tituloSistema').innerHTML = `${icono(s.icono)} ${idx + 1}. ${escapar(s.nombre)}`;
  $('vistaListadoSistemas').classList.add('hidden');
  $('vistaFormularioSistema').classList.remove('hidden');

  $('contenedorPaso').innerHTML = s.paneles.map(p => `
    <section class="panel">
      <header class="panel-header"><h3>${escapar(p.titulo)}</h3></header>
      <div class="panel-body">
        <div class="stack">${p.campos.map(plantillaCampo).join('')}</div>
      </div>
    </section>`).join('');

  $('alertaError').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Valor elegido en un grupo de botones de opción ('' si no se eligió ninguno) */
function valorVerificacion(id) {
  const marcado = document.querySelector(`input[name="${id}"]:checked`);
  return marcado ? marcado.value : '';
}

export function cambioVerificacion(id) {
  const box = $('box_' + id);
  const noConf = valorVerificacion(id) === 'No conforme';
  box.closest('.check-field').classList.toggle('non-compliant', noConf);
  box.classList.toggle('hidden', !noConf);
  $('campo_' + id).classList.remove('invalid');
  if (noConf) $(id + '_det').focus();
  else $(id + '_det').value = '';
}

function capturarRespuestasActuales() {
  const s = SISTEMAS[estado.pasoActual];
  s.paneles.forEach(p => {
    p.campos.forEach(c => {
      if (c.tipo === 'verificacion') {
        const det = $(c.id + '_det');
        if (det) estado.respuestas[c.id] = { estado: valorVerificacion(c.id), detalle: det.value.trim() };
      } else {
        const el = $(c.id);
        if (el) estado.respuestas[c.id] = el.value.trim();
      }
    });
  });
  guardarEstadoEnProgreso();
}

function validarPasoActual() {
  capturarRespuestasActuales();
  const s = SISTEMAS[estado.pasoActual];
  let errores = 0;

  document.querySelectorAll('#contenedorPaso .form-field').forEach(el => el.classList.remove('invalid'));

  s.paneles.forEach(p => {
    p.campos.forEach(c => {
      if (c.id === 'observacionesFinales') return;
      const campoDiv = $('campo_' + c.id);
      const valor = estado.respuestas[c.id];
      const invalido = c.tipo === 'verificacion'
        ? (!valor || !valor.estado || (valor.estado === 'No conforme' && !valor.detalle))
        : (!valor || valor.length === 0);
      if (invalido) {
        errores++;
        if (campoDiv) campoDiv.classList.add('invalid');
      }
    });
  });

  const alerta = $('alertaError');
  if (errores > 0) {
    alerta.textContent = `Tiene ${errores} campo(s) pendiente(s) o sin justificación en este sistema. Por favor complételos en rojo.`;
    alerta.classList.remove('hidden');
    alerta.scrollIntoView({ behavior: 'smooth' });
    return false;
  }
  alerta.classList.add('hidden');
  return true;
}

export function volverAlListadoSistemas() {
  capturarRespuestasActuales();
  const s = SISTEMAS[estado.pasoActual];
  if (obtenerEstadoSistema(s).completo) delete estado.justificacionesSistemas[s.id];
  guardarEstadoEnProgreso();
  mostrarListadoSistemas(false);
}

export async function guardarSistemaCompletado() {
  if (!validarPasoActual()) {
    await mostrarAlertaVisual('Sistema incompleto', 'Faltan campos obligatorios. Puede completarlos ahora o volver al listado y escribir una justificación para este sistema.', 'advertencia');
    return;
  }
  delete estado.justificacionesSistemas[SISTEMAS[estado.pasoActual].id];
  guardarEstadoEnProgreso();
  mostrarListadoSistemas(false);
}

/* Envío del informe */
export async function finalizarInspeccion() {
  if (!estado.inspeccionActiva) return;
  if (!$('vistaFormularioSistema').classList.contains('hidden')) capturarRespuestasActuales();

  const sinResolver = SISTEMAS.filter(s => {
    const e = obtenerEstadoSistema(s);
    return !e.completo && !e.justificado;
  });
  if (sinResolver.length) {
    estado.mostrarJustificacionesPendientes = true;
    guardarEstadoEnProgreso();
    mostrarListadoSistemas(true);
    await mostrarAlertaVisual('Informe incompleto', `No puede enviar el informe al ingeniero. Hay ${sinResolver.length} sistema(s) incompleto(s), marcados en rojo en el listado. Debe completarlos o escribir su justificación.`, 'advertencia');
    return;
  }

  // El servidor valida el informe, calcula duración y resultado, y lo guarda en la base de datos
  if (enviandoInforme) return;
  enviandoInforme = true;
  try {
    await crearInspeccion({
      tipoRecorrido: estado.inspeccionActiva.tipoRecorrido,
      horaInicioISO: estado.inspeccionActiva.horaInicioISO,
      datos: { ...estado.respuestas },
      justificacionesSistemas: { ...estado.justificacionesSistemas },
      ordenRecorrido: [...estado.ordenRecorrido]
    });
  } catch (e) {
    await mostrarAlertaVisual(e.titulo || 'No se pudo enviar el informe', e.message, 'advertencia');
    return;
  } finally {
    enviandoInforme = false;
  }

  eliminarProgreso();
  clearInterval(estado.intervaloCronometro);
  estado.inspeccionActiva = null;
  actualizarBloqueoNavegacionTecnico();

  $('estadoCabecera').textContent = 'Inspección enviada';
  await mostrarAlertaVisual('Inspección Finalizada', 'La inspección diaria ha sido registrada con éxito y enviada a la supervisión del Ingeniero.', 'exito');
  mostrarVista('devoluciones');
}

/* Cancelación con justificación */
export async function cancelarInspeccion() {
  if (!estado.inspeccionActiva) return;
  const justificacion = await solicitarJustificacionCancelacion();
  if (!justificacion) return;

  try {
    await crearCancelacion({
      tipoRecorrido: estado.inspeccionActiva.tipoRecorrido || '',
      horaInicioISO: estado.inspeccionActiva.horaInicioISO,
      justificacion,
      sistemasIniciados: [...estado.ordenRecorrido]
    });
  } catch (e) {
    await mostrarAlertaVisual(e.titulo || 'No se pudo cancelar el recorrido', e.message, 'advertencia');
    return;
  }
  cancelarInspeccionSinConfirmacion();
  await mostrarAlertaVisual('Recorrido cancelado', 'La cancelación y su justificación quedaron registradas.', 'info');
}

function cancelarInspeccionSinConfirmacion() {
  clearInterval(estado.intervaloCronometro);
  estado.inspeccionActiva = null;
  estado.respuestas = {};
  estado.justificacionesSistemas = {};
  estado.ordenRecorrido = [];
  estado.mostrarJustificacionesPendientes = false;
  eliminarProgreso();
  actualizarBloqueoNavegacionTecnico();
  $('estadoCabecera').textContent = 'Inspector activo';
  mostrarVista('inicio');
}

/* Cronómetro (el tiempo real se calcula desde horaInicioISO) */
export function iniciarCronometro() {
  clearInterval(estado.intervaloCronometro);
  actualizarCronometro();
  estado.intervaloCronometro = setInterval(actualizarCronometro, 1000);
}

function actualizarCronometro() {
  if (!estado.inspeccionActiva) return;
  const s = Math.max(0, Math.floor((Date.now() - new Date(estado.inspeccionActiva.horaInicioISO)) / 1000));
  const tiempo = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
  if ($('cronometro')) $('cronometro').textContent = tiempo;
  if ($('cronometroFormulario')) $('cronometroFormulario').textContent = tiempo;
}

function guardarEstadoEnProgreso() {
  if (!estado.inspeccionActiva) return;
  guardarProgreso({
    inspeccionActiva: estado.inspeccionActiva,
    pasoActual: estado.pasoActual,
    respuestas: estado.respuestas,
    justificacionesSistemas: estado.justificacionesSistemas,
    ordenRecorrido: estado.ordenRecorrido,
    mostrarJustificacionesPendientes: estado.mostrarJustificacionesPendientes
  });
}

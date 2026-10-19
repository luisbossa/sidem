/* Detalle del informe: auditoría, hallazgo destacado, conversación, revisión, respuesta y PDF. */
import { $, escapar } from '../core/dom.js';
import { estado } from '../core/state.js';
import { URL_ESTILOS_APP } from '../core/paths.js';
import { icono } from '../ui/icons.js';
import { formatearFechaCompleta, formatearHoraExacta, claveFechaLocal, etiquetaTipoRecorrido } from '../core/format.js';
import { SISTEMAS } from '../data/systems.js';
import { puedeInspeccionar, puedeSupervisar, puedeRevisarInforme, participoEnInforme } from '../core/roles.js';
import { leerRegistros, revisarInspeccion, responderInspeccion } from '../data/storage.js';
import { mostrarAlertaVisual } from '../ui/dialogs.js';
import { renderHistorial } from './history.js';
import { renderDevolucionesInspector } from './technician-reports.js';
import { verificarAlertasDevolucionesInspector } from './session.js';

function buscarHallazgo(r, campoId, sistemaDestacado) {
  if (!campoId) return null;
  for (const s of SISTEMAS) {
    for (const p of s.paneles) {
      const c = p.campos.find(campo => campo.id === campoId);
      if (!c) continue;
      const valor = r.datos ? r.datos[campoId] : null;
      let descripcion = 'Sin descripción registrada';
      let estadoValor = '';
      if (valor && typeof valor === 'object') {
        estadoValor = valor.estado || '';
        descripcion = valor.detalle || valor.estado || descripcion;
      } else if (valor !== null && valor !== undefined && String(valor).trim()) {
        descripcion = String(valor).trim();
      }
      return { campoId, sistema: sistemaDestacado || s.nombre, campo: c.label || campoId, descripcion, estado: estadoValor };
    }
  }
  return null;
}

function plantillaAuditoria(r) {
  const item = (titulo, contenido) => `<div class="audit-item"><strong>${titulo}</strong>${contenido}</div>`;
  return `
    <div class="audit-card">
      ${r.iniciadoPor
        ? `${item('Iniciado por', `<span>${escapar(r.iniciadoPor)}</span>`)}${item('Completado por', `<span>${escapar(r.inspector || 'Técnico')}</span>`)}`
        : item('Inspector Responsable', `<span>${escapar(r.inspector || 'Técnico')}</span>`)}
      ${item('Fecha de Inspección', `<span>${escapar(formatearFechaCompleta(r.fechaISO || r.horaInicioISO))}</span>`)}
      ${item('Tipo de Recorrido', `<span>${etiquetaTipoRecorrido(r.tipoRecorrido)}</span>`)}
      ${item('Condición Técnica', `<div><span class="tag ${r.resultado === 'Conforme' ? 'tag-green' : 'tag-red'}">${escapar(r.resultado)}</span></div>`)}
      ${item('Estado de Supervisión', `<div><strong class="audit-status">${escapar(r.estadoRevision || 'Pendiente')}</strong></div>`)}
    </div>`;
}

function plantillaHallazgo(h, r) {
  return `
    <section class="finding-callout">
      <div class="finding-tag">${icono('alerta')} FALLA REPORTADA POR EL TÉCNICO</div>
      <h4>Detalle del hallazgo seleccionado</h4>
      <div class="finding-meta">
        <div><strong>Sistema</strong><span>${escapar(h.sistema)}</span></div>
        <div><strong>Elemento / campo</strong><span>${escapar(h.campo)}</span></div>
        <div><strong>Técnico</strong><span>${escapar(r.inspector || 'Técnico')}</span></div>
      </div>
      <div class="finding-label">Descripción reportada</div>
      <div class="finding-description">${escapar(h.descripcion)}</div>
    </section>`;
}

function plantillaConversacion(historial) {
  const mensaje = item => {
    const esIngeniero = item.emisorRol === 'ingeniero';
    const encabezado = esIngeniero ? `${icono('maletin')} Observación del Ingeniero` : `${icono('casco')} Respuesta del Técnico`;
    return `
      <div class="message-bubble ${esIngeniero ? 'message-engineer' : 'message-technician'}">
        <div class="message-author">${encabezado} (${escapar(item.autor)} - ${escapar(formatearFechaCompleta(item.fechaISO))} ${escapar(formatearHoraExacta(item.fechaISO))}):</div>
        <div class="message-text">${escapar(item.texto)}</div>
      </div>`;
  };
  return `
    <section class="conversation-block">
      <h4 class="conversation-title">Historial de Observaciones y Subsanaciones</h4>
      ${historial.map(mensaje).join('')}
    </section>`;
}

function plantillaResolucion(r) {
  const esDevuelta = r.estadoRevision === 'Con observaciones';
  return `
    <section class="resolution-box ${esDevuelta ? 'resolution-returned' : ''}">
      <strong class="resolution-title">Resolución Técnica por: ${escapar(r.ingenieroRevisor)} (${escapar(r.estadoRevision)})</strong>
      <div><strong>Fecha de resolución:</strong> ${escapar(formatearFechaCompleta(r.fechaRevisionISO))} a las ${escapar(formatearHoraExacta(r.fechaRevisionISO))}</div>
      ${r.observacionesIngeniero
        ? `<div class="resolution-notes"><strong>Observaciones e Instrucciones del Ingeniero:</strong><p>${escapar(r.observacionesIngeniero)}</p></div>`
        : '<div class="resolution-empty"><em>Sin observaciones adicionales. Aprobada sin reparos.</em></div>'}
    </section>`;
}

function plantillaSistema(s, r, hallazgo) {
  const justificacion = r.justificacionesSistemas ? String(r.justificacionesSistemas[s.id] || '').trim() : '';
  const items = s.paneles.flatMap(p => p.campos).map(c => {
    const valor = r.datos ? r.datos[c.id] : null;
    let texto = '—';
    let esAnomalo = false;
    if (valor) {
      if (typeof valor === 'object') {
        texto = `${valor.estado}${valor.detalle ? ' — ' + valor.detalle : ''}`;
        esAnomalo = valor.estado === 'No conforme';
      } else {
        texto = `${valor} ${c.unidad || ''}`.trim();
      }
    }
    const esDestacado = hallazgo && hallazgo.campoId === c.id;
    return `
      <div id="reporte_campo_${c.id}" class="summary-item ${esAnomalo ? 'anomaly' : ''} ${esDestacado ? 'finding-highlight' : ''}">
        <strong>${escapar(c.label)}</strong>
        <span>${escapar(texto)}</span>
      </div>`;
  }).join('');

  return `
    <section class="summary-section" style="--section-color:${s.colores.tema}; --section-color-dark:${s.colores.oscuro}; --section-border:${s.colores.borde}; --section-text:${s.colores.textoCabecera};">
      <h4 class="summary-section-title">${icono(s.icono)}<span>${escapar(s.nombre)}</span></h4>
      <div class="summary-section-body">
        ${justificacion ? `
          <div class="report-justification">
            <strong>${icono('alerta')} SISTEMA NO COMPLETADO — JUSTIFICACIÓN DEL TÉCNICO</strong>
            <div>${escapar(justificacion)}</div>
          </div>` : ''}
        ${items}
      </div>
    </section>`;
}

function plantillaRevisionIngeniero(r) {
  return `
    <section class="review-box">
      <h4>Resolución Técnica del Ingeniero Supervisor</h4>
      <p class="box-intro">Apruebe la inspección o devuelva con observaciones técnicas al técnico:</p>
      <div class="form-field">
        <label for="txtObsIngeniero">Observaciones técnicas dirigidas al inspector:</label>
        <textarea id="txtObsIngeniero" rows="3" placeholder="Escriba aquí las indicaciones, requerimientos o aclaraciones sobre las anomalías encontradas..."></textarea>
      </div>
      <footer class="box-actions">
        <button type="button" class="btn btn-red" data-action="review-report" data-id="${r.id}" data-status="Con observaciones">${icono('alerta')} Devolver con Observaciones</button>
        <button type="button" class="btn btn-green" data-action="review-report" data-id="${r.id}" data-status="Aprobada">${icono('check')} Aprobar Inspección</button>
      </footer>
    </section>`;
}

function plantillaRespuestaTecnico(r) {
  return `
    <section class="reply-box">
      <h4>Subsanación y Respuesta a la Observación del Ingeniero</h4>
      <p class="box-intro">Detalla las correcciones ejecutadas, aclaraciones o medidas correctivas aplicadas en la Casa de Máquinas para reenviar el informe a supervisión:</p>
      <div class="form-field">
        <label for="txtRespTecnico">Respuesta y aclaraciones del Técnico Inspector *:</label>
        <textarea id="txtRespTecnico" rows="3" placeholder="Explique qué se corrigió o aclare el parámetro observado por el ingeniero..."></textarea>
      </div>
      <footer class="box-actions">
        <button type="button" class="btn btn-green" data-action="reply-report" data-id="${r.id}">${icono('enviar')} Responder y Reenviar Informe</button>
      </footer>
    </section>`;
}

export function verDetalle(id, campoDestacadoId = '', sistemaDestacado = '') {
  const r = leerRegistros().find(x => x.id === id);
  if (!r) return;
  estado.registroDetalleActivo = r;

  const usuario = estado.usuarioSesion;
  const hallazgo = buscarHallazgo(r, campoDestacadoId, sistemaDestacado);
  const supervisa = Boolean(usuario) && puedeSupervisar(usuario.rol);
  // Un Supervisor Técnico no revisa los recorridos en los que participó
  const puedeRevisar = puedeRevisarInforme(usuario, r);
  const esInspectorDuenio = Boolean(usuario) && puedeInspeccionar(usuario.rol) && r.inspectorId === usuario.id;

  $('modalTitulo').textContent = `Informe · ${formatearFechaCompleta(r.fechaISO || r.horaInicioISO)}`;
  $('btnGenerarPdfInforme').classList.toggle('hidden', !supervisa);

  let html = plantillaAuditoria(r);
  if (hallazgo) html += plantillaHallazgo(hallazgo, r);
  if (r.historialConversacion && r.historialConversacion.length) html += plantillaConversacion(r.historialConversacion);
  else if (r.ingenieroRevisor) html += plantillaResolucion(r);
  html += SISTEMAS.map(s => plantillaSistema(s, r, hallazgo)).join('');
  if (puedeRevisar) html += plantillaRevisionIngeniero(r);
  else if (supervisa && participoEnInforme(r, usuario.id)) html += '<p class="alert alert-info">Usted participó en este recorrido: la revisión la debe hacer otro ingeniero o supervisor técnico.</p>';
  if (esInspectorDuenio && r.estadoRevision === 'Con observaciones') html += plantillaRespuestaTecnico(r);

  $('detalleContenido').innerHTML = html;
  $('modalDetalle').classList.remove('hidden');

  if (hallazgo) {
    setTimeout(() => {
      const objetivo = $(`reporte_campo_${hallazgo.campoId}`);
      if (objetivo) objetivo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 220);
  }
}

export async function guardarRevisionIngeniero(id, nuevoEstado) {
  const usuario = estado.usuarioSesion;
  if (!puedeRevisarInforme(usuario, estado.registroDetalleActivo)) {
    await mostrarAlertaVisual('Acceso Denegado', 'Solo un ingeniero o supervisor técnico que no participó en el recorrido puede aprobar o emitir observaciones.', 'advertencia');
    return;
  }

  const obs = $('txtObsIngeniero').value.trim();
  if (nuevoEstado === 'Con observaciones' && !obs) {
    await mostrarAlertaVisual('Observación Requerida', 'Debe digitar las observaciones para el inspector si marca la inspección "Con observaciones".', 'advertencia');
    return;
  }

  try {
    await revisarInspeccion(id, nuevoEstado, obs);
  } catch (e) {
    await mostrarAlertaVisual(e.titulo || 'No se pudo registrar la resolución', e.message, 'advertencia');
    return;
  }

  cerrarDetalle();
  renderHistorial();
  await mostrarAlertaVisual('Resolución Registrada', `La inspección ha sido calificada como "${nuevoEstado}" con éxito.`, nuevoEstado === 'Aprobada' ? 'exito' : 'advertencia');
}

export async function guardarRespuestaYReenviar(id) {
  const usuario = estado.usuarioSesion;
  if (!usuario || !puedeInspeccionar(usuario.rol)) {
    await mostrarAlertaVisual('Acceso Denegado', 'Solo el técnico responsable puede responder a las observaciones.', 'advertencia');
    return;
  }

  const resp = $('txtRespTecnico').value.trim();
  if (!resp) {
    await mostrarAlertaVisual('Respuesta Requerida', 'Por favor digite su justificación técnica o aclaración antes de reenviar el informe.', 'advertencia');
    return;
  }

  try {
    await responderInspeccion(id, resp);
  } catch (e) {
    await mostrarAlertaVisual(e.titulo || 'No se pudo enviar la respuesta', e.message, 'advertencia');
    return;
  }

  cerrarDetalle();
  verificarAlertasDevolucionesInspector();
  renderDevolucionesInspector();
  await mostrarAlertaVisual('Informe Reenviado', 'Su respuesta técnica fue guardada y el informe se remitió de nuevo a la bandeja del Ingeniero para su revisión.', 'exito');
}

/* Estilos compactos para la versión imprimible */
const ESTILOS_PDF = `
  @page { size:A4 portrait; margin:9mm 10mm; }
  * { box-shadow:none !important; }
  html, body { width:auto; min-width:0; }
  body { background:#fff !important; color:#0f172a; margin:0; font-family:Arial,Helvetica,sans-serif; font-size:10.5px; line-height:1.3; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .pdf-document { max-width:none; margin:0; }
  .pdf-header { border-bottom:2px solid #0f172a; padding-bottom:7px; margin-bottom:10px; }
  .pdf-header h1 { margin:0 0 3px; font-size:17px; }
  .pdf-header p { margin:1px 0; color:#475569; font-size:9.5px; }
  .modal-body { padding:0; background:#fff; }
  .audit-card { grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; padding:9px 10px; margin-bottom:10px; border-width:1.5px; }
  .audit-item strong { font-size:8px; }
  .audit-item span { font-size:10.5px; }
  .summary-section { break-inside:auto; page-break-inside:auto; overflow:visible; margin-bottom:9px; border-width:1.5px; border-radius:8px; }
  .summary-section-title { margin:0; break-after:avoid-page; page-break-after:avoid; padding:7px 10px; font-size:11.5px; border-bottom-width:1.5px; }
  .summary-section-body { padding:7px 9px; gap:4px; }
  .summary-item { flex-direction:row; justify-content:space-between; align-items:center; break-inside:avoid; page-break-inside:avoid; min-height:0; padding:5px 8px; border-width:1px; border-radius:5px; font-size:9.5px; gap:7px; }
  .summary-item strong, .summary-item span { font-size:9.5px; }
  .summary-item span { text-align:right; }
  .finding-callout, .resolution-box { break-inside:avoid; page-break-inside:avoid; margin-bottom:9px; padding:10px; }
  .conversation-block { break-inside:auto; page-break-inside:auto; margin-bottom:9px; padding:10px; }
  .message-bubble { break-inside:avoid; page-break-inside:avoid; padding:8px 10px; margin-bottom:6px; font-size:9.5px; }
  h1, h2, h3, h4 { break-after:avoid-page; page-break-after:avoid; }
  p { orphans:3; widows:3; }`;

export async function generarPdfInforme() {
  const usuario = estado.usuarioSesion;
  const r = estado.registroDetalleActivo;
  if (!usuario || !puedeSupervisar(usuario.rol) || !r) {
    await mostrarAlertaVisual('Acceso denegado', 'Solo un ingeniero autorizado puede generar el PDF de una inspección.', 'advertencia');
    return;
  }

  const contenido = $('detalleContenido').cloneNode(true);
  contenido.querySelectorAll('.review-box, .reply-box, button').forEach(el => el.remove());
  const fechaClave = claveFechaLocal(r.fechaISO || r.horaInicioISO);
  const turno = r.tipoRecorrido === 'tarde' ? 'Tarde' : r.tipoRecorrido === 'manana' ? 'Manana' : 'Recorrido';
  const nombreDocumento = `Informe_${fechaClave}_${turno}_${String(r.inspector || 'Tecnico').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')}`;
  const hojaEstilos = URL_ESTILOS_APP;
  const ventana = window.open('', '_blank', 'width=1000,height=800');

  if (!ventana) {
    await mostrarAlertaVisual('Ventana bloqueada', 'Permita las ventanas emergentes del sistema para generar el PDF.', 'advertencia');
    return;
  }

  ventana.document.open();
  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapar(nombreDocumento)}</title>
    <link rel="stylesheet" href="${hojaEstilos}"><style>${ESTILOS_PDF}</style></head>
    <body><main class="pdf-document">
      <header class="pdf-header">
        <h1>Informe de Inspección de Sistemas Electromecánicos</h1>
        <p><strong>Área de Salud Naranjo · Servicio de Ingeniería y Mantenimiento CCSS</strong></p>
        <p>Documento generado por ${escapar(usuario.nombre)} el ${escapar(formatearFechaCompleta(new Date()))} a las ${escapar(formatearHoraExacta(new Date()))}</p>
      </header>
      <section class="modal-body">${contenido.innerHTML}</section>
    </main></body></html>`);
  ventana.document.close();
  ventana.focus();
  // Espera a que cargue la hoja de estilos antes de imprimir
  let impreso = false;
  const imprimir = () => {
    if (impreso) return;
    impreso = true;
    ventana.print();
  };
  ventana.addEventListener('load', () => setTimeout(imprimir, 100));
  setTimeout(imprimir, 1500);
}

export function cerrarDetalle() {
  $('modalDetalle').classList.add('hidden');
  estado.registroDetalleActivo = null;
}

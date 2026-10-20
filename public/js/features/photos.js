/* Fotos opcionales de las preguntas del recorrido: tomar o elegir, reducir, subir, mostrar y quitar.
   En el celular, el botón abre la cámara trasera. Máximo 3 fotos por pregunta. */
import { $, escapar } from '../core/dom.js';
import { estado } from '../core/state.js';
import { subirFoto, quitarFoto, urlFoto, esRecorridoNoDisponible, avisarRecorridoPerdido } from '../data/storage.js';
import { mostrarAlertaVisual } from '../ui/dialogs.js';
import { icono } from '../ui/icons.js';

export const MAX_FOTOS_POR_PREGUNTA = 3;
// Una foto de celular (~4 MB) queda en ~300 KB: sube rápido aunque la red sea lenta
const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.8;

const fotosDe = campoId => estado.fotos.filter(f => f.campoId === campoId);

/* Miniaturas + botón "Agregar foto" de una pregunta del formulario */
export function plantillaFotosCampo(campo) {
  return `<div class="photo-field" id="fotosCampo_${campo.id}">${contenidoFotosCampo(campo.id)}</div>`;
}

function contenidoFotosCampo(campoId, subiendo = null) {
  const fotos = fotosDe(campoId);
  const lleno = fotos.length >= MAX_FOTOS_POR_PREGUNTA;
  const miniaturas = fotos.map((f, i) => `
    <figure class="photo-thumb">
      <img src="${urlFoto(f.id)}" alt="Foto ${i + 1} de esta pregunta" loading="lazy" />
      <button type="button" class="photo-remove" data-action="remove-photo" data-id="${escapar(f.id)}" aria-label="Quitar foto ${i + 1}">${icono('cerrar')}</button>
    </figure>`).join('');
  const enCurso = subiendo ? `
    <figure class="photo-thumb photo-uploading" aria-live="polite">
      <img src="${subiendo}" alt="Foto que se está subiendo" />
      <figcaption>Subiendo…</figcaption>
    </figure>` : '';
  const boton = lleno || subiendo ? '' : `
    <label class="btn btn-secondary btn-xs photo-add">
      ${icono('camara')} Agregar foto <span class="photo-optional">(opcional)</span>
      <input type="file" accept="image/*" capture="environment" class="visually-hidden" data-change="add-photo" data-field="${escapar(campoId)}" />
    </label>`;
  const cuenta = fotos.length ? `<small class="photo-count">${fotos.length} de ${MAX_FOTOS_POR_PREGUNTA} fotos</small>` : '';
  return `${miniaturas || enCurso ? `<div class="photo-thumbs">${miniaturas}${enCurso}</div>` : ''}<div class="photo-actions">${boton}${cuenta}</div>`;
}

function repintar(campoId, subiendo = null) {
  const contenedor = $('fotosCampo_' + campoId);
  if (contenedor) contenedor.innerHTML = contenidoFotosCampo(campoId, subiendo);
}

/* Lee la imagen respetando la orientación de la cámara */
async function decodificar(archivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch { /* algunos navegadores no aceptan la opción: se intenta con <img> */ }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Reduce la foto a LADO_MAXIMO px y la convierte a JPEG */
export async function reducirImagen(archivo) {
  const imagen = await decodificar(archivo);
  const ancho = imagen.width || imagen.naturalWidth;
  const alto = imagen.height || imagen.naturalHeight;
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(ancho * escala));
  lienzo.height = Math.max(1, Math.round(alto * escala));
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close?.();
  return new Promise((resolve, reject) => lienzo.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', CALIDAD_JPEG));
}

export async function agregarFoto(input) {
  const campoId = input.dataset.field;
  const archivo = input.files && input.files[0];
  input.value = ''; // permite volver a elegir la misma foto
  if (!archivo || !estado.inspeccionActiva) return;
  if (fotosDe(campoId).length >= MAX_FOTOS_POR_PREGUNTA) return;
  if (!archivo.type.startsWith('image/')) {
    await mostrarAlertaVisual('Archivo no válido', 'Elija una foto (JPG, PNG o la cámara del celular).', 'advertencia');
    return;
  }

  let reducida;
  try {
    reducida = await reducirImagen(archivo);
  } catch {
    await mostrarAlertaVisual('No se pudo leer la foto', 'Este navegador no puede abrir ese formato de imagen. Tome la foto desde aquí con la cámara o elija una JPG o PNG.', 'advertencia');
    return;
  }

  const vistaPrevia = URL.createObjectURL(reducida);
  repintar(campoId, vistaPrevia);
  try {
    const foto = await subirFoto(estado.inspeccionActiva.id, campoId, reducida);
    estado.fotos.push(foto);
  } catch (e) {
    repintar(campoId);
    if (esRecorridoNoDisponible(e)) return avisarRecorridoPerdido(e);
    await mostrarAlertaVisual(e.titulo || 'No se pudo subir la foto', e.message, 'advertencia');
    return;
  } finally {
    URL.revokeObjectURL(vistaPrevia);
  }
  repintar(campoId);
}

export async function quitarFotoDeCampo(id) {
  const foto = estado.fotos.find(f => f.id === id);
  if (!foto) return;
  try {
    await quitarFoto(id);
  } catch (e) {
    if (esRecorridoNoDisponible(e)) return avisarRecorridoPerdido(e);
    // Si ya no existe en el servidor, igual se quita de la pantalla
    if (e.estado !== 404) {
      await mostrarAlertaVisual(e.titulo || 'No se pudo quitar la foto', e.message, 'advertencia');
      return;
    }
  }
  estado.fotos = estado.fotos.filter(f => f.id !== id);
  repintar(foto.campoId);
}

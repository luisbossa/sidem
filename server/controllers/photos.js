/* Controlador de fotos de las preguntas del recorrido (opcionales, máximo 3 por pregunta).
   - Subir y quitar: solo el responsable del recorrido abierto.
   - Ver: quien supervisa, o un técnico que participó en el informe o que tiene el recorrido a cargo. */
import fs from 'node:fs';
import { recorridoACargo } from './route-drafts.js';
import { MAX_FOTOS_POR_PREGUNTA } from '../models/photo.js';
import { SISTEMAS } from '../../public/js/data/systems.js';
import { puedeSupervisar, participoEnInforme } from '../../public/js/core/roles.js';
import { solicitudInvalida, noEncontrado, conflicto } from '../utils/errors.js';

/* campoId → sistemaId (las observaciones finales también admiten fotos) */
const SISTEMA_DE_CAMPO = new Map(SISTEMAS.flatMap(s => s.paneles.flatMap(p => p.campos).map(c => [c.id, s.id])));

/* El tipo se decide por el contenido ("bytes mágicos"), no por lo que diga el navegador */
function tipoDeImagen(contenido) {
  if (contenido.length > 3 && contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff) return 'image/jpeg';
  if (contenido.length > 8 && contenido.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export function crearControladorFotos({ fotos, recorridos, inspecciones }) {
  /* ¿Puede la persona de la sesión ver esta foto? */
  function puedeVer(foto, usuario) {
    if (puedeSupervisar(usuario.rol)) return true;
    if (foto.inspeccionId) return participoEnInforme(inspecciones.buscar(foto.inspeccionId), usuario.id);
    return recorridos.buscar(foto.recorridoId)?.responsableId === usuario.id;
  }

  return {
    subir(req, res) {
      const campoId = String(req.query.campo || '');
      const sistemaId = SISTEMA_DE_CAMPO.get(campoId);
      if (!sistemaId) throw solicitudInvalida('La pregunta indicada no existe.');
      const contenido = Buffer.isBuffer(req.body) ? req.body : null;
      const tipo = contenido && tipoDeImagen(contenido);
      if (!tipo) throw solicitudInvalida('El archivo no es una imagen JPG o PNG.', 'Foto no válida');

      // El navegador indica a qué recorrido pertenece la foto; solo su responsable actual puede agregarla
      const recorrido = recorridoACargo(recorridos, String(req.query.recorrido || ''), req.usuario);
      if (fotos.contarDePregunta(recorrido.id, campoId) >= MAX_FOTOS_POR_PREGUNTA) {
        throw conflicto(`Cada pregunta admite como máximo ${MAX_FOTOS_POR_PREGUNTA} fotos.`, 'Límite de fotos');
      }
      res.status(201).json(fotos.crear({ recorridoId: recorrido.id, campoId, sistemaId, tipo, contenido, usuarioId: req.usuario.id }));
    },

    quitar(req, res) {
      const foto = fotos.buscar(req.params.id);
      if (!foto || !foto.recorridoId) throw noEncontrado('La foto no existe o ya forma parte de un informe enviado.');
      recorridoACargo(recorridos, foto.recorridoId, req.usuario);
      fotos.eliminar(foto.id);
      res.status(204).end();
    },

    ver(req, res) {
      const foto = fotos.buscar(req.params.id);
      if (!foto || !puedeVer(foto, req.usuario)) throw noEncontrado('La foto no existe.');
      const ruta = fotos.rutaArchivo(foto);
      if (!fs.existsSync(ruta)) throw noEncontrado('El archivo de la foto no se encuentra en el servidor.');
      // Las fotos no cambian: el navegador puede guardarlas, pero solo para esta persona
      res.set({ 'Content-Type': foto.tipo, 'Cache-Control': 'private, max-age=86400' });
      res.sendFile(ruta);
    }
  };
}

/* Modelo Fotos: fotos opcionales de las preguntas de un recorrido.
   La fila guarda a qué pregunta pertenece; el archivo está en la carpeta de fotos (<id>.jpg o <id>.png).
   Mientras el recorrido está abierto se liga a recorrido_id; al enviar el informe pasa a inspeccion_id
   (lo hace Inspecciones.crear() en su transacción). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ahoraISO } from '../utils/dates.js';

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png' };
export const MAX_FOTOS_POR_PREGUNTA = 3;

export class Fotos {
  constructor(db, carpeta) {
    this.db = db;
    this.carpeta = carpeta;
  }

  rutaArchivo({ id, tipo }) {
    return path.join(this.carpeta, `${id}.${EXTENSION[tipo]}`);
  }

  buscar(id) {
    return this.db.prepare(`
      SELECT id, recorrido_id AS recorridoId, inspeccion_id AS inspeccionId, campo_id AS campoId, sistema_id AS sistemaId, tipo, tamano
      FROM fotos WHERE id = ?`).get(id) || null;
  }

  contarDePregunta(recorridoId, campoId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM fotos WHERE recorrido_id = ? AND campo_id = ?').get(recorridoId, campoId).n;
  }

  /* Escribe el archivo y luego la fila; si la fila falla, se borra el archivo */
  crear({ recorridoId, campoId, sistemaId, tipo, contenido, usuarioId }) {
    const foto = { id: 'foto-' + crypto.randomUUID(), tipo };
    fs.mkdirSync(this.carpeta, { recursive: true });
    fs.writeFileSync(this.rutaArchivo(foto), contenido);
    try {
      this.db.prepare(`
        INSERT INTO fotos (id, recorrido_id, campo_id, sistema_id, tipo, tamano, subida_por_id, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(foto.id, recorridoId, campoId, sistemaId, tipo, contenido.length, usuarioId, ahoraISO());
    } catch (e) {
      fs.rmSync(this.rutaArchivo(foto), { force: true });
      throw e;
    }
    return { id: foto.id, campoId };
  }

  /* [{ id, campoId }] de un recorrido abierto */
  listarDeRecorrido(recorridoId) {
    return this.db.prepare('SELECT id, campo_id AS campoId FROM fotos WHERE recorrido_id = ? ORDER BY creado_en').all(recorridoId).map(f => ({ ...f }));
  }

  eliminar(id) {
    const foto = this.buscar(id);
    if (!foto) return;
    this.db.prepare('DELETE FROM fotos WHERE id = ?').run(id);
    fs.rmSync(this.rutaArchivo(foto), { force: true });
  }

  /* Al cancelar o descartar un recorrido */
  eliminarDeRecorrido(recorridoId) {
    const fotos = this.db.prepare('SELECT id, tipo FROM fotos WHERE recorrido_id = ?').all(recorridoId);
    this.db.prepare('DELETE FROM fotos WHERE recorrido_id = ?').run(recorridoId);
    fotos.forEach(f => fs.rmSync(this.rutaArchivo(f), { force: true }));
  }
}

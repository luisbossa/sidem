/* Modelo RecorridosEnCurso: borrador del recorrido que un técnico tiene a medias. */
import { ahoraISO } from '../utils/dates.js';

export class RecorridosEnCurso {
  constructor(db) {
    this.db = db;
  }

  leer(usuarioId) {
    const fila = this.db.prepare('SELECT datos FROM recorridos_en_curso WHERE usuario_id = ?').get(usuarioId);
    return fila ? JSON.parse(fila.datos) : null;
  }

  guardar(usuarioId, datos) {
    this.db.prepare(`
      INSERT INTO recorridos_en_curso (usuario_id, datos, actualizado_en) VALUES (?, ?, ?)
      ON CONFLICT (usuario_id) DO UPDATE SET datos = excluded.datos, actualizado_en = excluded.actualizado_en`)
      .run(usuarioId, JSON.stringify(datos), ahoraISO());
  }

  eliminar(usuarioId) {
    this.db.prepare('DELETE FROM recorridos_en_curso WHERE usuario_id = ?').run(usuarioId);
  }
}

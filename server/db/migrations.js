/* Migraciones para bases creadas con versiones anteriores. schema.sql solo crea lo que falta
   (CREATE TABLE IF NOT EXISTS), pero no agrega columnas a tablas que ya existen.
   Cada paso comprueba si ya se aplicó, así que se puede ejecutar en cada arranque. */
import crypto from 'node:crypto';
import { diaLocal } from '../utils/dates.js';

const tieneColumna = (db, tabla, columna) =>
  db.prepare(`PRAGMA table_info(${tabla})`).all().some(c => c.name === columna);

const existeTabla = (db, tabla) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla));

export function migrar(db) {
  if (!tieneColumna(db, 'inspecciones', 'iniciado_por_id')) {
    db.exec('ALTER TABLE inspecciones ADD COLUMN iniciado_por_id TEXT REFERENCES usuarios (id)');
  }

  // Borradores por técnico (recorridos_en_curso) → recorridos abiertos compartidos
  if (existeTabla(db, 'recorridos_en_curso')) {
    const insertar = db.prepare(`
      INSERT OR IGNORE INTO recorridos_abiertos
        (id, tipo_recorrido, fecha_local, iniciado_por_id, iniciado_en, responsable_id, datos, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    db.exec('BEGIN');
    try {
      for (const fila of db.prepare('SELECT usuario_id, datos, actualizado_en FROM recorridos_en_curso').all()) {
        let datos;
        try { datos = JSON.parse(fila.datos); } catch { continue; }
        const activa = datos && datos.inspeccionActiva;
        const inicio = new Date(activa && activa.horaInicioISO);
        if (!activa || !['manana', 'tarde'].includes(activa.tipoRecorrido) || Number.isNaN(inicio.getTime())) continue;
        const id = typeof activa.id === 'string' && activa.id ? activa.id : 'rec-' + crypto.randomUUID();
        activa.id = id;
        insertar.run(id, activa.tipoRecorrido, diaLocal(inicio), fila.usuario_id, inicio.toISOString(),
          fila.usuario_id, JSON.stringify(datos), fila.actualizado_en);
      }
      db.exec('DROP TABLE recorridos_en_curso');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

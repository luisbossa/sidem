/* Migraciones para bases creadas con versiones anteriores. schema.sql solo crea lo que falta
   (CREATE TABLE IF NOT EXISTS), pero no agrega columnas a tablas que ya existen.
   Cada paso comprueba si ya se aplicó, así que se puede ejecutar en cada arranque. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { diaLocal } from '../utils/dates.js';

const tieneColumna = (db, tabla, columna) =>
  db.prepare(`PRAGMA table_info(${tabla})`).all().some(c => c.name === columna);

const existeTabla = (db, tabla) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla));

/* Definición actual de la tabla usuarios, tomada de schema.sql para no repetirla aquí */
const DEFINICION_USUARIOS = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  .match(/CREATE TABLE IF NOT EXISTS usuarios \([\s\S]*?\n\);/)[0];

/* SQLite no permite cambiar el CHECK de una columna: para aceptar un rol nuevo se crea la tabla
   con la definición actual, se copian los datos y se reemplaza (procedimiento oficial de SQLite).
   Las demás tablas siguen apuntando a "usuarios" por nombre, así que sus referencias no cambian. */
function reconstruirUsuarios(db) {
  const columnas = 'id, nombre, rol, usuario, password_hash, cedula, turno, estado, creado_en, eliminado_en';
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      db.exec(DEFINICION_USUARIOS.replace('CREATE TABLE IF NOT EXISTS usuarios', 'CREATE TABLE usuarios_nueva'));
      db.exec(`INSERT INTO usuarios_nueva (${columnas}) SELECT ${columnas} FROM usuarios`);
      db.exec('DROP TABLE usuarios');
      db.exec('ALTER TABLE usuarios_nueva RENAME TO usuarios');
      const rotas = db.prepare('PRAGMA foreign_key_check').all();
      if (rotas.length) throw new Error(`La migración de usuarios dejó ${rotas.length} referencia(s) rotas.`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function migrar(db) {
  if (!tieneColumna(db, 'usuarios', 'eliminado_en')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN eliminado_en TEXT');
  }

  // Rol "supervisor" (Supervisor Técnico)
  const sqlUsuarios = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get().sql;
  if (sqlUsuarios.includes("CHECK (rol IN") && !sqlUsuarios.includes("'supervisor'")) reconstruirUsuarios(db);

  // Rol semanal de lunes a viernes: las semanas de lunes a domingo pasan a terminar el viernes
  // (las que tengan otro rango se dejan como están)
  db.exec(`UPDATE semanas_rol SET fin = date(inicio, '+4 days')
           WHERE strftime('%w', inicio) = '1' AND fin = date(inicio, '+6 days')`);

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

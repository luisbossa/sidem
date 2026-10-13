/* Conexión SQLite (módulo node:sqlite incluido en Node ≥ 22.13).
   Al abrir: crea la carpeta, aplica el esquema y carga los datos iniciales si la base está vacía. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sembrarDatosIniciales } from './seed.js';

const ESQUEMA = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function abrirBaseDatos(ruta, opciones = {}) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (ruta !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(ESQUEMA);
  sembrarDatosIniciales(db, opciones);
  return db;
}

/* Ejecuta fn dentro de una transacción: todo se guarda o nada se guarda */
export function enTransaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

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
  verificarEscritura(db, ruta);
  sembrarDatosIniciales(db, opciones);
  return db;
}

/* Comprueba al arrancar que se puede escribir (limpia las sesiones vencidas). Sin permiso de escritura
   la app abre y muestra páginas, pero falla al iniciar sesión o guardar: mejor detenerse con un mensaje claro. */
function verificarEscritura(db, ruta) {
  try {
    db.prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(new Date().toISOString());
  } catch (e) {
    if (e.errcode !== 8) throw e; // 8 = SQLITE_READONLY
    throw new Error(
      `La base de datos ${ruta} es de solo lectura. Dé permiso de "Modificar" sobre la carpeta ` +
      `${path.dirname(ruta)} a la cuenta que ejecuta Node (en IIS: IIS AppPool\\<nombre del Application Pool>).`,
      { cause: e }
    );
  }
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

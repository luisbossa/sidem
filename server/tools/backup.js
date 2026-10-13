/* Copia de respaldo de la base de datos: npm run respaldo
   Usa VACUUM INTO, que genera una copia consistente aunque el servidor esté en marcha.
   Las copias quedan en data/respaldos/sidem-AAAAMMDD-HHMMSS.db */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

if (!fs.existsSync(config.rutaBaseDatos)) {
  console.error(`[SIDEM] No existe la base de datos: ${config.rutaBaseDatos}`);
  process.exit(1);
}

const carpeta = path.join(path.dirname(config.rutaBaseDatos), 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });
const marca = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const destino = path.join(carpeta, `sidem-${marca}.db`);

const db = new DatabaseSync(config.rutaBaseDatos, { readOnly: true });
db.prepare('VACUUM INTO ?').run(destino);
db.close();
console.log(`[SIDEM] Respaldo creado: ${destino}`);

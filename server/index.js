/* Arranque del servidor SIDEM: abre la base SQLite y escucha en el puerto configurado. */
import { config } from './config.js';
import { abrirBaseDatos } from './db/connection.js';
import { crearApp } from './app.js';

const db = abrirBaseDatos(config.rutaBaseDatos);
const app = crearApp(db);

const servidor = app.listen(config.puerto, () => {
  console.log(`[SIDEM] Base de datos: ${config.rutaBaseDatos}`);
  console.log(`[SIDEM] Servidor listo en http://localhost:${config.puerto}`);
});

/* Cierre ordenado: termina las solicitudes en curso y cierra la base */
function cerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

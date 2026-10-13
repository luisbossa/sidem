/* Punto de entrada para Vercel: exporta la app Express como función serverless.
   La base se abre una vez por instancia y se reutiliza mientras la instancia siga activa. */
import { config } from '../server/config.js';
import { abrirBaseDatos } from '../server/db/connection.js';
import { crearApp } from '../server/app.js';

const db = abrirBaseDatos(config.rutaBaseDatos);

export default crearApp(db);

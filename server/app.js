/* Aplicación Express (MVC):
   - Modelos (models/): acceso a SQLite.
   - Vistas (views/): plantillas EJS con layouts (express-ejs-layouts).
   - Controladores (controllers/): reciben la petición, validan, usan los modelos y responden.
   - Rutas (routes/): asocian cada URL con su middleware y su controlador. */
import path from 'node:path';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import compression from 'compression';
import { config } from './config.js';
import { crearModelos } from './models/index.js';
import { cargarSesion } from './middleware/auth.js';
import { cabecerasSeguridad } from './middleware/security-headers.js';
import { manejarErrores, paginaNoEncontrada } from './middleware/error-handler.js';
import { rutasWeb } from './routes/web.js';
import { rutasApi } from './routes/api.js';
import { icono } from '../public/js/ui/icons.js';
import { puedeInspeccionar, puedeSupervisar } from '../public/js/core/roles.js';

/* opciones.carpetaFotos: dónde guardar las fotos (los tests usan una carpeta temporal) */
export function crearApp(db, { carpetaFotos = config.carpetaFotos } = {}) {
  const modelos = crearModelos(db, { carpetaFotos });
  const app = express();

  // Vistas EJS con layouts
  app.set('view engine', 'ejs');
  app.set('views', path.join(config.raiz, 'server', 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/app');
  app.locals.icono = icono; // los mismos iconos SVG que usa el navegador
  // Permisos por rol para las vistas (los mismos que usan el navegador y la API)
  app.locals.puedeInspeccionar = puedeInspeccionar;
  app.locals.puedeSupervisar = puedeSupervisar;

  app.disable('x-powered-by');
  // Detrás del proxy (Vercel o IIS), req.ip debe salir de X-Forwarded-For (bloqueo de login por IP)
  if (config.detrasDeProxy) app.set('trust proxy', true);
  app.use(cabecerasSeguridad);
  // Comprime las respuestas de texto (JSON, HTML, CSS, JS): /api/datos con un año de informes
  // baja de ~3 MB a ~50 KB. Las fotos (JPG/PNG) ya vienen comprimidas y no se tocan.
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cargarSesion(modelos));

  app.use('/api', rutasApi(modelos));
  app.use(rutasWeb());
  app.use(express.static(config.carpetaPublica, {
    index: false,
    setHeaders: res => res.set('Cache-Control', 'no-cache')
  }));

  app.use(paginaNoEncontrada);
  app.use(manejarErrores);
  return app;
}

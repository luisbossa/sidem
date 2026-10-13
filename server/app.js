/* Aplicación Express (MVC):
   - Modelos (models/): acceso a SQLite.
   - Vistas (views/): plantillas EJS con layouts (express-ejs-layouts).
   - Controladores (controllers/): reciben la petición, validan, usan los modelos y responden.
   - Rutas (routes/): asocian cada URL con su middleware y su controlador. */
import path from 'node:path';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import { config } from './config.js';
import { crearModelos } from './models/index.js';
import { cargarSesion } from './middleware/auth.js';
import { cabecerasSeguridad } from './middleware/security-headers.js';
import { manejarErrores, paginaNoEncontrada } from './middleware/error-handler.js';
import { rutasWeb } from './routes/web.js';
import { rutasApi } from './routes/api.js';
import { icono } from '../public/js/ui/icons.js';

export function crearApp(db) {
  const modelos = crearModelos(db);
  const app = express();

  // Vistas EJS con layouts
  app.set('view engine', 'ejs');
  app.set('views', path.join(config.raiz, 'server', 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/app');
  app.locals.icono = icono; // los mismos iconos SVG que usa el navegador

  app.disable('x-powered-by');
  // Detrás del proxy de Vercel, req.ip debe salir de X-Forwarded-For (bloqueo de login por IP)
  if (config.enVercel) app.set('trust proxy', true);
  app.use(cabecerasSeguridad);
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

/* Rutas de páginas (vistas EJS). */
import { Router } from 'express';
import { requiereSesionPagina, soloSinSesion } from '../middleware/auth.js';
import { crearControladorPaginas } from '../controllers/pages.js';

export function rutasWeb() {
  const paginas = crearControladorPaginas();
  const router = Router();

  router.get('/', paginas.inicio);
  router.get('/login', soloSinSesion, paginas.login);
  router.get('/app', requiereSesionPagina, paginas.app);

  // Direcciones de la versión anterior (archivos .html)
  router.get(['/index.html', '/pages/login.html'], (req, res) => res.redirect(301, '/login'));
  router.get('/pages/app.html', (req, res) => res.redirect(301, '/app'));

  return router;
}

/* Controlador de páginas: arma los datos de cada vista EJS y la renderiza con su layout. */
import { TURNOS } from './users.js';

/* Menú de navegación por rol (barra lateral en escritorio, barra inferior en móvil) */
const MENU = {
  inspector: [
    { id: 'btnIrInicioInspector', vista: 'inicio', icono: 'inicio', texto: 'Inicio' },
    { id: 'btnIrDevolucionesInspector', vista: 'devoluciones', icono: 'portapapeles', texto: 'Mis informes' },
    { id: 'btnIrCronogramaInspector', vista: 'cronograma', icono: 'calendario', texto: 'Rol semanal' }
  ],
  ingeniero: [
    { id: 'btnIrDashboardIngeniero', vista: 'dashboard', icono: 'grafico', texto: 'Dashboard' },
    { id: 'btnIrHistorialIngeniero', vista: 'historial', icono: 'buscar', texto: 'Inspecciones' },
    { id: 'btnIrCronogramaIngeniero', vista: 'cronograma', icono: 'calendario', texto: 'Rol semanal' },
    { id: 'btnIrTecnicosIngeniero', vista: 'tecnicos', icono: 'usuarios', texto: 'Usuarios' }
  ]
};

const PERFIL = {
  inspector: { rolTexto: 'Técnico Inspector', rolClase: 'role-badge-inspector', estado: 'Inspector activo', vistaInicial: 'Inicio' },
  ingeniero: { rolTexto: 'Ingeniero Supervisor', rolClase: 'role-badge-engineer', estado: 'Supervisor activo', vistaInicial: 'Dashboard' }
};

/* "Ing. Juan Pérez" → "JP" */
function iniciales(nombre) {
  const palabras = String(nombre).replace(/^(ing|tec|téc)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return palabras.slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
}

export function crearControladorPaginas() {
  return {
    /* Raíz: a la app si hay sesión, si no al inicio de sesión */
    inicio(req, res) {
      res.redirect(req.usuario ? '/app' : '/login');
    },

    login(req, res) {
      res.render('pages/login', {
        layout: 'layouts/auth',
        tituloPagina: 'Iniciar sesión'
      });
    },

    app(req, res) {
      const { rol, nombre } = req.usuario;
      const perfil = PERFIL[rol];
      res.render('pages/app', {
        layout: 'layouts/app',
        tituloPagina: perfil.vistaInicial,
        menu: MENU[rol],
        perfil,
        iniciales: iniciales(nombre),
        fechaHoy: new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        turnos: TURNOS
      });
    }
  };
}

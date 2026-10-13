/* Punto de entrada de la vista /login. Si ya hay sesión, el servidor redirige a /app. */
import { registrarAcciones, iniciarDelegacionEventos } from './ui/actions.js';
import { iniciarSesion, alternarVisibilidadPassword } from './features/login.js';

registrarAcciones({
  click: { 'toggle-password': () => alternarVisibilidadPassword() },
  submit: { 'login': (form, e) => iniciarSesion(e) }
});
iniciarDelegacionEventos();

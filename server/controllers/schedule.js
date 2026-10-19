/* Controlador del rol semanal. Todos lo consultan; lo modifica quien supervisa.
   Se puede asignar a cualquiera que haga recorridos (técnico o Supervisor Técnico). */
import { texto, dia } from '../utils/validation.js';
import { solicitudInvalida, noEncontrado } from '../utils/errors.js';
import { puedeInspeccionar } from '../../public/js/core/roles.js';
import { finDeSemanaRol } from '../utils/dates.js';

export function crearControladorCronograma({ semanas, usuarios }) {
  function leerDatos(cuerpo, usuarioSesion) {
    // La semana del rol va de lunes a viernes: el cierre lo calcula el servidor
    const inicio = dia(cuerpo.inicio, 'Fecha de inicio');
    if (new Date(inicio + 'T00:00:00Z').getUTCDay() !== 1) {
      throw solicitudInvalida('La semana del rol debe empezar un lunes.', 'Fecha de inicio no válida');
    }
    const fin = finDeSemanaRol(inicio);

    const tecnico = usuarios.buscar(texto(cuerpo.tecnicoId, 'Técnico', { requerido: true, max: 80 }));
    if (!tecnico || !puedeInspeccionar(tecnico.rol) || tecnico.estado !== 'Activo') {
      throw solicitudInvalida('Debe asignar un técnico inspector o supervisor técnico activo.', 'Técnico no válido');
    }
    return {
      inicio,
      fin,
      tecnicoId: tecnico.id,
      notas: texto(cuerpo.notas, 'Notas', { max: 500 }),
      asignadoPorId: usuarioSesion.id
    };
  }

  return {
    listar(req, res) {
      res.json(semanas.listar());
    },

    crear(req, res) {
      res.status(201).json(semanas.crear(leerDatos(req.body || {}, req.usuario)));
    },

    actualizar(req, res) {
      if (!semanas.buscar(req.params.id)) throw noEncontrado('La semana no existe.');
      res.json(semanas.actualizar(req.params.id, leerDatos(req.body || {}, req.usuario)));
    },

    eliminar(req, res) {
      if (!semanas.eliminar(req.params.id)) throw noEncontrado('La semana no existe.');
      res.status(204).end();
    }
  };
}

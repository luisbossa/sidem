/* Controlador del rol semanal. Todos lo consultan; solo el ingeniero lo modifica. */
import { texto, dia } from '../utils/validation.js';
import { solicitudInvalida, noEncontrado } from '../utils/errors.js';

export function crearControladorCronograma({ semanas, usuarios }) {
  function leerDatos(cuerpo, usuarioSesion) {
    const inicio = dia(cuerpo.inicio, 'Fecha de inicio');
    const fin = dia(cuerpo.fin, 'Fecha de cierre');
    if (fin < inicio) throw solicitudInvalida('La fecha de cierre no puede ser anterior a la de inicio.');

    const tecnico = usuarios.buscar(texto(cuerpo.tecnicoId, 'Técnico', { requerido: true, max: 80 }));
    if (!tecnico || tecnico.rol !== 'inspector' || tecnico.estado !== 'Activo') {
      throw solicitudInvalida('Debe asignar un técnico inspector activo.', 'Técnico no válido');
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

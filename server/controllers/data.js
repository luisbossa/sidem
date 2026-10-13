/* Controlador de datos iniciales: todo lo que la app necesita al cargar, según el rol. */
export function crearControladorDatos({ usuarios, semanas, inspecciones, cancelaciones, recorridos }) {
  return {
    obtener(req, res) {
      const esIngeniero = req.usuario.rol === 'ingeniero';
      const soloPropios = esIngeniero ? null : req.usuario.id;
      res.json({
        usuario: req.usuario,
        usuarios: esIngeniero ? usuarios.listar() : [],
        cronograma: semanas.listar(),
        registros: inspecciones.listar(soloPropios),
        cancelaciones: cancelaciones.listar(soloPropios),
        progreso: esIngeniero ? null : recorridos.leer(req.usuario.id)
      });
    }
  };
}

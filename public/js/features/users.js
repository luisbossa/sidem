/* Gestión de usuarios y roles (solo ingenieros). Las contraseñas solo viajan al guardar;
   el servidor nunca las devuelve. */
import { $, escapar } from '../core/dom.js';
import { icono } from '../ui/icons.js';
import { leerUsuarios, leerRegistros, guardarUsuario, sincronizar } from '../data/storage.js';
import { mostrarAlertaVisual } from '../ui/dialogs.js';

let guardando = false;

function plantillaFila(u, inspecciones) {
  const esIngeniero = u.rol === 'ingeniero';
  const propias = inspecciones.filter(r => r.inspectorId === u.id);
  const pendientes = propias.filter(r => r.estadoRevision === 'Con observaciones').length;

  return `
    <tr>
      <td><strong>${escapar(u.nombre)}</strong></td>
      <td><span class="role-badge ${esIngeniero ? 'role-badge-engineer' : 'role-badge-inspector'}">${esIngeniero ? 'Ingeniero' : 'Técnico'}</span></td>
      <td><code>${escapar(u.usuario)}</code></td>
      <td>${escapar(u.turno)}</td>
      <td><span class="tag ${u.estado === 'Activo' ? 'tag-green' : 'tag-red'}">${escapar(u.estado)}</span></td>
      <td>
        ${esIngeniero ? '<em>Supervisor</em>' : `
          <span>${propias.length} realizada(s)</span>
          ${pendientes > 0 ? `<br><small class="user-pending-note">${pendientes} con observaciones</small>` : ''}`}
      </td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn btn-secondary btn-xs" data-action="open-user-modal" data-id="${escapar(u.id)}">${icono('editar')} Editar</button>
          ${esIngeniero ? '' : `<button type="button" class="btn btn-blue btn-xs" data-action="filter-history-by-technician" data-name="${escapar(u.nombre)}">${icono('grafico')} Ver Historial</button>`}
        </div>
      </td>
    </tr>`;
}

export function renderListaTecnicos() {
  const usuarios = leerUsuarios();
  const inspecciones = leerRegistros();
  const div = $('tecnicosContenido');

  if (!usuarios.length) {
    div.innerHTML = '<p class="empty-state">No hay usuarios registrados.</p>';
    return;
  }

  div.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr><th>Nombre</th><th>Rol</th><th>Usuario</th><th>Turno / Puesto</th><th>Estado</th><th>Inspecciones</th><th>Acciones</th></tr>
        </thead>
        <tbody>${usuarios.map(u => plantillaFila(u, inspecciones)).join('')}</tbody>
      </table>
    </div>`;
}

export function actualizarCamposPorRol() {
  $('contenedorTurnoTecnico').classList.toggle('hidden', $('tecnicoRol').value === 'ingeniero');
}

export function abrirModalTecnico(id = null) {
  $('formTecnico').reset();
  $('tecnicoId').value = '';
  $('tecnicoPassword').value = '';

  const u = id ? leerUsuarios().find(x => x.id === id) : null;
  if (u) {
    $('modalTecnicoTitulo').textContent = 'Editar Usuario y Rol';
    $('tecnicoId').value = u.id;
    $('tecnicoNombre').value = u.nombre;
    $('tecnicoRol').value = u.rol;
    $('tecnicoUsuario').value = u.usuario;
    $('tecnicoPassword').required = false;
    $('tecnicoPassword').placeholder = 'Sin cambios';
    $('ayudaPassword').textContent = 'Deje este campo en blanco si no desea modificar la contraseña actual.';
    $('tecnicoCedula').value = u.cedula || '';
    if (u.rol === 'inspector') $('tecnicoTurno').value = u.turno;
    $('tecnicoEstado').value = u.estado;
  } else {
    $('modalTecnicoTitulo').textContent = 'Registrar Nuevo Usuario';
    $('tecnicoPassword').required = true;
    $('tecnicoPassword').placeholder = 'Defina una clave segura';
    $('ayudaPassword').textContent = 'Defina la contraseña de acceso para este nuevo usuario.';
  }

  actualizarCamposPorRol();
  $('modalTecnico').classList.remove('hidden');
}

export function cerrarModalTecnico() {
  $('modalTecnico').classList.add('hidden');
}

export async function guardarTecnico(e) {
  if (e) e.preventDefault();
  if (guardando) return;

  const datos = {
    id: $('tecnicoId').value || undefined,
    nombre: $('tecnicoNombre').value.trim(),
    rol: $('tecnicoRol').value,
    usuario: $('tecnicoUsuario').value.trim().toLowerCase(),
    password: $('tecnicoPassword').value.trim(),
    cedula: $('tecnicoCedula').value.trim(),
    turno: $('tecnicoTurno').value,
    estado: $('tecnicoEstado').value
  };

  if (!datos.nombre || !datos.usuario) {
    await mostrarAlertaVisual('Datos Incompletos', 'Nombre y Usuario son obligatorios.', 'advertencia');
    return;
  }
  if (!datos.id && !datos.password) {
    await mostrarAlertaVisual('Contraseña Obligatoria', 'Debe asignar una contraseña para el nuevo usuario.', 'advertencia');
    return;
  }

  guardando = true;
  try {
    await guardarUsuario(datos);
    // Recarga informes y rol semanal por si cambió el nombre del usuario
    await sincronizar();
  } catch (error) {
    await mostrarAlertaVisual(error.titulo || 'No se pudo guardar el usuario', error.message, 'advertencia');
    return;
  } finally {
    guardando = false;
  }

  cerrarModalTecnico();
  renderListaTecnicos();
  await mostrarAlertaVisual('Usuario Guardado', `La cuenta de ${datos.nombre} (${datos.rol.toUpperCase()}) fue guardada con éxito en el sistema.`, 'exito');
}

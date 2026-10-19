/* Gestión de usuarios y roles (solo ingenieros). Las contraseñas solo viajan al guardar;
   el servidor nunca las devuelve. */
import { $, escapar } from '../core/dom.js';
import { icono } from '../ui/icons.js';
import { estado } from '../core/state.js';
import { PERFILES, puedeInspeccionar } from '../core/roles.js';
import {
  leerUsuarios, leerRegistros, guardarUsuario, eliminarUsuario, sincronizar, leerAjustes, guardarAjustes, leerRecorridosAbiertos
} from '../data/storage.js';
import { formatearFechaCorta, formatearHoraExacta, etiquetaTipoRecorrido } from '../core/format.js';
import { mostrarAlertaVisual, mostrarConfirmacionVisual } from '../ui/dialogs.js';
import { textoDondeQuedo } from './inspection.js';

let guardando = false;

function plantillaFila(u, inspecciones) {
  const haceRecorridos = puedeInspeccionar(u.rol);
  const perfil = PERFILES[u.rol] || PERFILES.inspector;
  const propias = inspecciones.filter(r => r.inspectorId === u.id);
  const pendientes = propias.filter(r => r.estadoRevision === 'Con observaciones').length;

  return `
    <tr>
      <td><strong>${escapar(u.nombre)}</strong></td>
      <td><span class="role-badge ${perfil.rolClase}">${perfil.rolCorto}</span></td>
      <td><code>${escapar(u.usuario)}</code></td>
      <td>${escapar(u.turno || '—')}</td>
      <td><span class="tag ${u.estado === 'Activo' ? 'tag-green' : 'tag-red'}">${escapar(u.estado)}</span></td>
      <td>
        ${!haceRecorridos ? '<em>Supervisor</em>' : `
          <span>${propias.length} realizada(s)</span>
          ${pendientes > 0 ? `<br><small class="user-pending-note">${pendientes} con observaciones</small>` : ''}`}
      </td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn btn-secondary btn-xs" data-action="open-user-modal" data-id="${escapar(u.id)}">${icono('editar')} Editar</button>
          ${!haceRecorridos ? '' : `<button type="button" class="btn btn-blue btn-xs" data-action="filter-history-by-technician" data-name="${escapar(u.nombre)}">${icono('grafico')} Ver Historial</button>`}
          ${u.id === estado.usuarioSesion?.id ? '' : `<button type="button" class="btn btn-red btn-xs" data-action="delete-user" data-id="${escapar(u.id)}">${icono('eliminar')} Eliminar</button>`}
        </div>
      </td>
    </tr>`;
}

export function renderListaTecnicos() {
  renderRecorridosAbiertos();
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

/* Recorridos sin terminar: interruptor para que otro técnico los continúe y listado (solo lectura) */
function renderRecorridosAbiertos() {
  const casilla = $('chkPermitirTomaRecorridos');
  if (!casilla) return;
  casilla.checked = leerAjustes().permitirTomaRecorridos;

  const abiertos = leerRecorridosAbiertos();
  $('recorridosAbiertosContenido').innerHTML = abiertos.length ? `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Recorrido</th><th>Iniciado por</th><th>A cargo de</th><th>Sistemas iniciados</th><th>Quedó en</th><th>Última actividad</th></tr></thead>
        <tbody>${abiertos.map(r => `
          <tr>
            <td>${etiquetaTipoRecorrido(r.tipoRecorrido)} · ${escapar(formatearFechaCorta(r.iniciadoEnISO))}</td>
            <td>${escapar(r.iniciadoPor)}<br><small>${escapar(formatearHoraExacta(r.iniciadoEnISO))}</small></td>
            <td>${escapar(r.responsable)}</td>
            <td>${r.sistemasIniciados}</td>
            <td>${r.quedoEn ? escapar(textoDondeQuedo(r.quedoEn)) : '—'}</td>
            <td>${escapar(formatearHoraExacta(r.actualizadoEnISO))}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>` : '<p class="empty-state">No hay recorridos sin terminar en este momento.</p>';
}

export async function cambiarPermisoTomaRecorridos(casilla) {
  const valor = casilla.checked;
  casilla.disabled = true;
  try {
    await guardarAjustes({ permitirTomaRecorridos: valor });
  } catch (error) {
    casilla.checked = !valor;
    await mostrarAlertaVisual(error.titulo || 'No se pudo guardar el ajuste', error.message, 'advertencia');
    return;
  } finally {
    casilla.disabled = false;
  }
  await mostrarAlertaVisual('Ajuste guardado', valor
    ? 'Los técnicos ya pueden continuar un recorrido que otro dejó a medias, confirmando su usuario y contraseña.'
    : 'Solo el técnico que inicia un recorrido puede terminarlo.', 'exito');
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
    $('tecnicoEstado').value = u.estado;
  } else {
    $('modalTecnicoTitulo').textContent = 'Registrar Nuevo Usuario';
    $('tecnicoPassword').required = true;
    $('tecnicoPassword').placeholder = 'Defina una clave segura';
    $('ayudaPassword').textContent = 'Defina la contraseña de acceso para este nuevo usuario.';
  }

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
  await mostrarAlertaVisual('Usuario Guardado', `La cuenta de ${datos.nombre} (${(PERFILES[datos.rol] || PERFILES.inspector).rolTexto}) fue guardada con éxito en el sistema.`, 'exito');
}

/* Elimina un usuario: deja de aparecer y de poder entrar, pero sus informes conservan su nombre */
export async function eliminarUsuarioConfirmado(id) {
  const u = leerUsuarios().find(x => x.id === id);
  if (!u || guardando) return;
  const confirmar = await mostrarConfirmacionVisual(
    `¿Eliminar a ${u.nombre}?`,
    'Ya no aparecerá en la lista ni podrá iniciar sesión, y su nombre de usuario quedará libre. Sus informes, cancelaciones y mensajes anteriores se conservan con su nombre. Esta acción no se puede deshacer desde la aplicación.',
    'Sí, eliminar',
    'advertencia'
  );
  if (!confirmar) return;

  guardando = true;
  try {
    await eliminarUsuario(id);
    await sincronizar();
  } catch (error) {
    await mostrarAlertaVisual(error.titulo || 'No se pudo eliminar el usuario', error.message, 'advertencia');
    return;
  } finally {
    guardando = false;
  }
  renderListaTecnicos();
  await mostrarAlertaVisual('Usuario eliminado', `${u.nombre} fue eliminado del sistema. Su historial se conserva.`, 'exito');
}

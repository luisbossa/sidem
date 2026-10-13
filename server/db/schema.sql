-- SIDEM · esquema de la base de datos SQLite.
-- Fechas y horas: texto ISO 8601 en UTC (AAAA-MM-DDTHH:MM:SS.sssZ); días: AAAA-MM-DD.
-- Se aplica al arrancar el servidor; todas las sentencias son idempotentes.

-- Personal con acceso al sistema. Nunca se borran: se marcan como inactivos.
CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('inspector', 'ingeniero')),
  usuario       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  cedula        TEXT NOT NULL DEFAULT '',
  turno         TEXT NOT NULL DEFAULT '',
  estado        TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo / Vacaciones')),
  creado_en     TEXT NOT NULL
);

-- Sesiones abiertas. Se guarda el hash SHA-256 del token, nunca el token.
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);

-- Rol semanal: técnico asignado a los recorridos de cada semana.
CREATE TABLE IF NOT EXISTS semanas_rol (
  id              TEXT PRIMARY KEY,
  inicio          TEXT NOT NULL,
  fin             TEXT NOT NULL,
  tecnico_id      TEXT NOT NULL REFERENCES usuarios (id),
  notas           TEXT NOT NULL DEFAULT '',
  asignado_por_id TEXT REFERENCES usuarios (id),
  CHECK (fin >= inicio)
);
CREATE INDEX IF NOT EXISTS idx_semanas_inicio ON semanas_rol (inicio);

-- Informe de un recorrido enviado al ingeniero.
CREATE TABLE IF NOT EXISTS inspecciones (
  id                      TEXT PRIMARY KEY,
  inspector_id            TEXT NOT NULL REFERENCES usuarios (id),
  tipo_recorrido          TEXT NOT NULL CHECK (tipo_recorrido IN ('manana', 'tarde')),
  fecha_local             TEXT NOT NULL,
  hora_inicio             TEXT NOT NULL,
  hora_fin                TEXT NOT NULL,
  duracion_segundos       INTEGER NOT NULL CHECK (duracion_segundos >= 0),
  resultado               TEXT NOT NULL CHECK (resultado IN ('Conforme', 'Con anomalías', 'Inspección parcial justificada')),
  estado_revision         TEXT NOT NULL DEFAULT 'Pendiente de revisión'
                          CHECK (estado_revision IN ('Pendiente de revisión', 'Con observaciones', 'Respuesta enviada por técnico', 'Aprobada')),
  ingeniero_revisor_id    TEXT REFERENCES usuarios (id),
  fecha_revision          TEXT,
  observaciones_ingeniero TEXT NOT NULL DEFAULT '',
  respuesta_tecnico       TEXT NOT NULL DEFAULT '',
  fecha_respuesta_tecnico TEXT,
  -- Un recorrido de mañana y uno de tarde por técnico y día
  UNIQUE (inspector_id, tipo_recorrido, fecha_local)
);
CREATE INDEX IF NOT EXISTS idx_inspecciones_inicio ON inspecciones (hora_inicio);
CREATE INDEX IF NOT EXISTS idx_inspecciones_estado ON inspecciones (estado_revision);

-- Sistemas de un informe: orden en que se recorrieron y justificación si no se completaron.
CREATE TABLE IF NOT EXISTS inspeccion_sistemas (
  inspeccion_id TEXT NOT NULL REFERENCES inspecciones (id) ON DELETE CASCADE,
  sistema_id    TEXT NOT NULL,
  orden         INTEGER,
  justificacion TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (inspeccion_id, sistema_id)
);

-- Lecturas y verificaciones registradas en cada campo (catálogo en public/js/data/systems.js).
CREATE TABLE IF NOT EXISTS inspeccion_valores (
  inspeccion_id TEXT NOT NULL REFERENCES inspecciones (id) ON DELETE CASCADE,
  campo_id      TEXT NOT NULL,
  sistema_id    TEXT NOT NULL,
  valor         TEXT,
  verificacion  TEXT CHECK (verificacion IN ('Conforme', 'No conforme', 'No aplica')),
  detalle       TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (inspeccion_id, campo_id),
  CHECK ((valor IS NULL) <> (verificacion IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_valores_verificacion ON inspeccion_valores (verificacion);

-- Conversación entre el ingeniero (observaciones) y el técnico (respuestas).
CREATE TABLE IF NOT EXISTS inspeccion_mensajes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspeccion_id TEXT NOT NULL REFERENCES inspecciones (id) ON DELETE CASCADE,
  autor_id      TEXT NOT NULL REFERENCES usuarios (id),
  emisor_rol    TEXT NOT NULL CHECK (emisor_rol IN ('inspector', 'ingeniero')),
  texto         TEXT NOT NULL,
  fecha         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mensajes_inspeccion ON inspeccion_mensajes (inspeccion_id);

-- Recorridos cancelados con su justificación.
CREATE TABLE IF NOT EXISTS cancelaciones (
  id                 TEXT PRIMARY KEY,
  inspector_id       TEXT NOT NULL REFERENCES usuarios (id),
  tipo_recorrido     TEXT CHECK (tipo_recorrido IN ('manana', 'tarde')),
  hora_inicio        TEXT NOT NULL,
  fecha_cancelacion  TEXT NOT NULL,
  duracion_segundos  INTEGER NOT NULL CHECK (duracion_segundos >= 0),
  justificacion      TEXT NOT NULL,
  sistemas_iniciados TEXT NOT NULL DEFAULT '[]'
);

-- Borrador del recorrido en curso de cada técnico (se restaura al recargar o cambiar de equipo).
CREATE TABLE IF NOT EXISTS recorridos_en_curso (
  usuario_id     TEXT PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  datos          TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

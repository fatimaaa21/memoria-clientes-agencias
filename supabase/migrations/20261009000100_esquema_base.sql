-- =============================================================================
-- Esquema base: agencias, miembros, clientes, fuentes y registros del expediente
-- =============================================================================
-- Convenciones:
--   * Todo pertenece a una agencia (agency_id) para aislar a cada cliente del SaaS.
--   * Nada se borra físicamente desde la app: clientes se archivan, registros y
--     fuentes se "eliminan" con deleted_at (restaurables) y los miembros se desactivan.
--   * Las funciones auxiliares de permisos viven en el esquema `private`, que no
--     se expone por la API de Supabase.

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'ejecutivo', 'colaborador', 'externo');
create type public.record_kind as enum ('acuerdo', 'consideracion', 'pendiente');
create type public.record_status as enum ('por_confirmar', 'confirmado');
create type public.source_kind as enum ('registro_rapido', 'documento', 'texto', 'audio');

-- -----------------------------------------------------------------------------
-- Agencias
-- -----------------------------------------------------------------------------
create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  created_at  timestamptz not null default now()
);
comment on table public.agencies is 'Cada agencia cliente del producto (tenant).';

-- -----------------------------------------------------------------------------
-- Miembros de la agencia (usuarios + rol)
-- -----------------------------------------------------------------------------
create table public.agency_members (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  role               public.app_role not null,
  full_name          text,
  email              text,
  active             boolean not null default true,
  access_expires_at  timestamptz,           -- obligatorio para externos (90 días por omisión)
  created_at         timestamptz not null default now(),
  unique (agency_id, user_id)
);
comment on table public.agency_members is 'Usuarios de una agencia con su rol. Se desactivan, nunca se borran desde la app.';
create index agency_members_user_idx on public.agency_members (user_id);

-- Invitaciones: el admin invita por correo; al registrarse, el usuario las acepta.
create table public.agency_invitations (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  email        text not null,
  role         public.app_role not null,
  full_name    text,
  access_expires_at timestamptz,
  invited_by   uuid references public.agency_members(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index agency_invitations_pending_uq
  on public.agency_invitations (agency_id, lower(email)) where accepted_at is null;
create index agency_invitations_invited_by_idx on public.agency_invitations (invited_by);

-- -----------------------------------------------------------------------------
-- Clientes de la agencia
-- -----------------------------------------------------------------------------
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 160),
  owner_member_id   uuid references public.agency_members(id),   -- responsable
  backup_member_id  uuid references public.agency_members(id),   -- suplente
  archived_at       timestamptz,
  created_by        uuid references public.agency_members(id),
  created_at        timestamptz not null default now(),
  check (owner_member_id is distinct from backup_member_id or owner_member_id is null)
);
create index clients_agency_idx on public.clients (agency_id);
create index clients_owner_idx on public.clients (owner_member_id);
create index clients_backup_idx on public.clients (backup_member_id);
create index clients_created_by_idx on public.clients (created_by);

-- Asignación de colaboradores y externos a clientes
create table public.client_assignments (
  client_id   uuid not null references public.clients(id) on delete cascade,
  member_id   uuid not null references public.agency_members(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (client_id, member_id)
);
create index client_assignments_member_idx on public.client_assignments (member_id);
create index client_assignments_agency_idx on public.client_assignments (agency_id);

-- -----------------------------------------------------------------------------
-- Fuentes: de dónde sale la información (reunión, documento, texto, audio)
-- -----------------------------------------------------------------------------
create table public.sources (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  kind          public.source_kind not null,
  title         text not null check (char_length(title) between 1 and 200),
  occurred_at   date not null default current_date,  -- fecha de la reunión o del documento
  body          text,                                -- texto pegado o extraído
  storage_path  text,                                -- archivo en Supabase Storage (sprint 2)
  created_by    uuid references public.agency_members(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    uuid references public.agency_members(id)
);
create index sources_client_idx on public.sources (client_id, occurred_at desc);
create index sources_agency_idx on public.sources (agency_id);
create index sources_created_by_idx on public.sources (created_by);
create index sources_deleted_by_idx on public.sources (deleted_by);

-- -----------------------------------------------------------------------------
-- Registros del expediente: acuerdos, consideraciones y pendientes
-- -----------------------------------------------------------------------------
create table public.records (
  id                     uuid primary key default gen_random_uuid(),
  agency_id              uuid not null references public.agencies(id) on delete cascade,
  client_id              uuid not null references public.clients(id) on delete cascade,
  source_id              uuid references public.sources(id) on delete set null,
  kind                   public.record_kind not null,
  status                 public.record_status not null default 'por_confirmar',
  content                text not null check (char_length(content) between 1 and 4000),
  responsible_member_id  uuid references public.agency_members(id),
  due_date               date,
  is_internal            boolean not null default false,  -- no se envía al cliente ni la ven externos
  external_task_url      text,                            -- tarea en Asana/Monday (sprint 3)
  created_by             uuid references public.agency_members(id),
  confirmed_by           uuid references public.agency_members(id),
  confirmed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  deleted_by             uuid references public.agency_members(id)
);
create index records_client_idx on public.records (client_id, created_at desc);
create index records_agency_idx on public.records (agency_id);
create index records_source_idx on public.records (source_id);
create index records_responsible_idx on public.records (responsible_member_id);
create index records_created_by_idx on public.records (created_by);
create index records_confirmed_by_idx on public.records (confirmed_by);
create index records_deleted_by_idx on public.records (deleted_by);
create index records_pending_idx on public.records (client_id) where status = 'por_confirmar' and deleted_at is null;

-- Historial de cambios de cada registro (un acuerdo modificado conserva su historia)
create table public.record_history (
  id          bigint generated always as identity primary key,
  record_id   uuid not null references public.records(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  changed_by  uuid references public.agency_members(id),
  changed_at  timestamptz not null default now(),
  old_values  jsonb,
  new_values  jsonb
);
create index record_history_record_idx on public.record_history (record_id, changed_at desc);
create index record_history_agency_idx on public.record_history (agency_id);
create index record_history_client_idx on public.record_history (client_id);
create index record_history_changed_by_idx on public.record_history (changed_by);

-- Bitácora de actividad (quién creó, confirmó, editó, envió o eliminó qué)
create table public.activity_log (
  id          bigint generated always as identity primary key,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  actor_id    uuid references public.agency_members(id),
  action      text not null,     -- crear, editar, confirmar, eliminar, restaurar, archivar, asignar...
  entity      text not null,     -- client, record, source, member, assignment
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index activity_log_agency_idx on public.activity_log (agency_id, created_at desc);
create index activity_log_client_idx on public.activity_log (client_id, created_at desc);
create index activity_log_actor_idx on public.activity_log (actor_id);

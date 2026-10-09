-- =============================================================================
-- Funciones de permisos (esquema private) y triggers de reglas de negocio
-- =============================================================================
-- Las funciones son SECURITY DEFINER para poder consultar tablas protegidas por
-- RLS sin recursión. Todas fijan search_path vacío y usan nombres calificados.

-- -----------------------------------------------------------------------------
-- Identidad del usuario actual dentro de una agencia
-- -----------------------------------------------------------------------------

-- Id de miembro activo (y con acceso vigente) del usuario actual en la agencia.
create or replace function private.member_id(p_agency uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.agency_members m
  where m.agency_id = p_agency
    and m.user_id = (select auth.uid())
    and m.active
    and (m.access_expires_at is null or m.access_expires_at > now())
$$;

create or replace function private.member_role(p_agency uuid)
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.agency_members m
  where m.agency_id = p_agency
    and m.user_id = (select auth.uid())
    and m.active
    and (m.access_expires_at is null or m.access_expires_at > now())
$$;

create or replace function private.is_admin(p_agency uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.member_role(p_agency) = 'admin', false)
$$;

-- ¿El usuario actual está asignado a este cliente?
create or replace function private.is_assigned(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.client_assignments a
    join public.agency_members m on m.id = a.member_id
    where a.client_id = p_client
      and m.user_id = (select auth.uid())
      and m.active
      and (m.access_expires_at is null or m.access_expires_at > now())
  )
$$;

-- Ver un cliente: admin (todos), responsable/suplente, o asignado.
-- Los clientes archivados solo los ve el admin.
create or replace function private.can_view_client(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    join public.agency_members m
      on m.agency_id = c.agency_id
     and m.user_id = (select auth.uid())
     and m.active
     and (m.access_expires_at is null or m.access_expires_at > now())
    where c.id = p_client
      and (
        m.role = 'admin'
        or (c.archived_at is null and (
              c.owner_member_id = m.id
           or c.backup_member_id = m.id
           or exists (select 1 from public.client_assignments a
                      where a.client_id = c.id and a.member_id = m.id)))
      )
  )
$$;

-- Administrar un cliente (confirmar, editar, enviar, asignar, crear tareas):
-- admin, o ejecutivo responsable/suplente de un cliente no archivado.
create or replace function private.can_manage_client(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    join public.agency_members m
      on m.agency_id = c.agency_id
     and m.user_id = (select auth.uid())
     and m.active
     and (m.access_expires_at is null or m.access_expires_at > now())
    where c.id = p_client
      and (
        m.role = 'admin'
        or (m.role = 'ejecutivo' and c.archived_at is null
            and (c.owner_member_id = m.id or c.backup_member_id = m.id))
      )
  )
$$;

-- Aportar información (registro rápido, subir documentos):
-- quien administra el cliente, o ejecutivo/colaborador asignado. Externos nunca.
create or replace function private.can_contribute_client(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_manage_client(p_client)
      or exists (
        select 1
        from public.clients c
        join public.agency_members m
          on m.agency_id = c.agency_id
         and m.user_id = (select auth.uid())
         and m.active
         and (m.access_expires_at is null or m.access_expires_at > now())
        join public.client_assignments a
          on a.client_id = c.id and a.member_id = m.id
        where c.id = p_client
          and c.archived_at is null
          and m.role in ('ejecutivo', 'colaborador')
      )
$$;

-- -----------------------------------------------------------------------------
-- Bitácora de actividad
-- -----------------------------------------------------------------------------
create or replace function private.log_activity(
  p_agency uuid, p_client uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb default null
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.activity_log (agency_id, client_id, actor_id, action, entity, entity_id, details)
  values (p_agency, p_client, private.member_id(p_agency), p_action, p_entity, p_entity_id, p_details);
$$;

-- -----------------------------------------------------------------------------
-- Miembros
-- -----------------------------------------------------------------------------
create or replace function private.tg_members_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.agency_id := old.agency_id;
    new.user_id   := old.user_id;
    new.created_at := old.created_at;
  end if;

  -- Los externos siempre tienen fecha de vencimiento (90 días por omisión)
  if new.role = 'externo' and new.access_expires_at is null then
    new.access_expires_at := now() + interval '90 days';
  end if;

  -- Nunca dejar a una agencia sin administrador activo
  if tg_op = 'UPDATE'
     and old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and not exists (
       select 1 from public.agency_members m
       where m.agency_id = old.agency_id and m.id <> old.id and m.role = 'admin' and m.active
     ) then
    raise exception 'La agencia debe conservar al menos un administrador activo';
  end if;

  return new;
end;
$$;

create trigger members_before
  before insert or update on public.agency_members
  for each row execute function private.tg_members_before();

create or replace function private.tg_members_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, null, 'alta', 'member', new.id,
      jsonb_build_object('role', new.role, 'email', new.email));
  elsif old.active and not new.active then
    perform private.log_activity(new.agency_id, null, 'desactivar', 'member', new.id, null);
  elsif not old.active and new.active then
    perform private.log_activity(new.agency_id, null, 'reactivar', 'member', new.id, null);
  elsif old.role is distinct from new.role then
    perform private.log_activity(new.agency_id, null, 'cambiar_rol', 'member', new.id,
      jsonb_build_object('de', old.role, 'a', new.role));
  end if;
  return null;
end;
$$;

create trigger members_after
  after insert or update on public.agency_members
  for each row execute function private.tg_members_after();

-- Invitaciones
create or replace function private.tg_invitations_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' then
    new.invited_by := coalesce(private.member_id(new.agency_id), new.invited_by);
    new.accepted_at := null;
  end if;
  if new.role = 'externo' and new.access_expires_at is null then
    new.access_expires_at := now() + interval '90 days';
  end if;
  return new;
end;
$$;

create trigger invitations_before
  before insert or update on public.agency_invitations
  for each row execute function private.tg_invitations_before();

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create or replace function private.tg_clients_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_me    uuid;
  v_role  public.app_role;
begin
  if tg_op = 'UPDATE' then
    new.agency_id  := old.agency_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  v_me   := private.member_id(new.agency_id);
  v_role := private.member_role(new.agency_id);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_me, new.created_by);
    new.archived_at := null;
    -- Un ejecutivo que crea un cliente queda como responsable o suplente
    if v_role = 'ejecutivo' then
      if new.owner_member_id is null then
        new.owner_member_id := v_me;
      elsif new.owner_member_id <> v_me and new.backup_member_id is distinct from v_me then
        raise exception 'Un ejecutivo solo puede crear clientes donde es responsable o suplente';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_me is not null and v_role <> 'admin' then
    if new.archived_at is distinct from old.archived_at then
      raise exception 'Solo un administrador puede archivar o restaurar clientes';
    end if;
    if new.owner_member_id is distinct from old.owner_member_id then
      raise exception 'Solo un administrador puede cambiar al responsable del cliente';
    end if;
  end if;

  -- Responsable y suplente deben ser admin o ejecutivo activos de la misma agencia
  if new.owner_member_id is not null and not exists (
       select 1 from public.agency_members m
       where m.id = new.owner_member_id and m.agency_id = new.agency_id
         and m.active and m.role in ('admin', 'ejecutivo')) then
    raise exception 'El responsable debe ser un administrador o ejecutivo activo de la agencia';
  end if;
  if new.backup_member_id is not null and not exists (
       select 1 from public.agency_members m
       where m.id = new.backup_member_id and m.agency_id = new.agency_id
         and m.active and m.role in ('admin', 'ejecutivo')) then
    raise exception 'El suplente debe ser un administrador o ejecutivo activo de la agencia';
  end if;

  return new;
end;
$$;

create trigger clients_before
  before insert or update on public.clients
  for each row execute function private.tg_clients_before();

create or replace function private.tg_clients_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, new.id, 'crear', 'client', new.id,
      jsonb_build_object('name', new.name));
  elsif old.archived_at is null and new.archived_at is not null then
    perform private.log_activity(new.agency_id, new.id, 'archivar', 'client', new.id, null);
  elsif old.archived_at is not null and new.archived_at is null then
    perform private.log_activity(new.agency_id, new.id, 'restaurar', 'client', new.id, null);
  else
    perform private.log_activity(new.agency_id, new.id, 'editar', 'client', new.id,
      jsonb_build_object(
        'name', case when new.name is distinct from old.name then new.name end,
        'owner_member_id', case when new.owner_member_id is distinct from old.owner_member_id then new.owner_member_id end,
        'backup_member_id', case when new.backup_member_id is distinct from old.backup_member_id then new.backup_member_id end));
  end if;
  return null;
end;
$$;

create trigger clients_after
  after insert or update on public.clients
  for each row execute function private.tg_clients_after();

-- -----------------------------------------------------------------------------
-- Asignaciones de clientes
-- -----------------------------------------------------------------------------
create or replace function private.tg_assignments_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select c.agency_id into new.agency_id from public.clients c where c.id = new.client_id;
  if not exists (select 1 from public.agency_members m
                 where m.id = new.member_id and m.agency_id = new.agency_id) then
    raise exception 'La persona asignada no pertenece a la agencia del cliente';
  end if;
  return new;
end;
$$;

create trigger assignments_before
  before insert on public.client_assignments
  for each row execute function private.tg_assignments_before();

create or replace function private.tg_assignments_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, new.client_id, 'asignar', 'assignment', new.member_id, null);
  else
    perform private.log_activity(old.agency_id, old.client_id, 'desasignar', 'assignment', old.member_id, null);
  end if;
  return null;
end;
$$;

create trigger assignments_after
  after insert or delete on public.client_assignments
  for each row execute function private.tg_assignments_after();

-- -----------------------------------------------------------------------------
-- Fuentes
-- -----------------------------------------------------------------------------
create or replace function private.tg_sources_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid;
begin
  if tg_op = 'INSERT' then
    select c.agency_id into new.agency_id from public.clients c where c.id = new.client_id;
    new.created_by := coalesce(private.member_id(new.agency_id), new.created_by);
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;

  new.agency_id  := old.agency_id;
  new.client_id  := old.client_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  v_me := private.member_id(new.agency_id);

  if new.deleted_at is distinct from old.deleted_at then
    if v_me is not null and not private.is_admin(new.agency_id) then
      raise exception 'Solo un administrador puede eliminar o restaurar fuentes';
    end if;
    new.deleted_by := case when new.deleted_at is null then null else v_me end;
  end if;
  return new;
end;
$$;

create trigger sources_before
  before insert or update on public.sources
  for each row execute function private.tg_sources_before();

create or replace function private.tg_sources_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, new.client_id, 'crear', 'source', new.id,
      jsonb_build_object('kind', new.kind, 'title', new.title));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform private.log_activity(new.agency_id, new.client_id, 'eliminar', 'source', new.id, null);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform private.log_activity(new.agency_id, new.client_id, 'restaurar', 'source', new.id, null);
  else
    perform private.log_activity(new.agency_id, new.client_id, 'editar', 'source', new.id, null);
  end if;
  return null;
end;
$$;

create trigger sources_after
  after insert or update on public.sources
  for each row execute function private.tg_sources_after();

-- -----------------------------------------------------------------------------
-- Registros del expediente
-- -----------------------------------------------------------------------------
create or replace function private.tg_records_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_me   uuid;
  v_role public.app_role;
begin
  if tg_op = 'INSERT' then
    select c.agency_id into new.agency_id from public.clients c where c.id = new.client_id;
  else
    new.agency_id  := old.agency_id;
    new.client_id  := old.client_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  v_me   := private.member_id(new.agency_id);
  v_role := private.member_role(new.agency_id);

  -- La fuente debe pertenecer al mismo cliente
  if new.source_id is not null and not exists (
       select 1 from public.sources s where s.id = new.source_id and s.client_id = new.client_id) then
    raise exception 'La fuente no pertenece a este cliente';
  end if;

  -- El responsable debe ser miembro de la misma agencia
  if new.responsible_member_id is not null and not exists (
       select 1 from public.agency_members m
       where m.id = new.responsible_member_id and m.agency_id = new.agency_id) then
    raise exception 'El responsable no pertenece a la agencia';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_me, new.created_by);
    new.deleted_at := null;
    new.deleted_by := null;
    -- Lo que registra un colaborador siempre queda por confirmar
    if v_role is not null and v_role not in ('admin', 'ejecutivo') then
      new.status := 'por_confirmar';
    end if;
    if new.status = 'confirmado' then
      new.confirmed_by := new.created_by;
      new.confirmed_at := now();
    else
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.deleted_at is distinct from old.deleted_at then
    if v_me is not null and v_role <> 'admin' then
      raise exception 'Solo un administrador puede eliminar o restaurar registros';
    end if;
    new.deleted_by := case when new.deleted_at is null then null else v_me end;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'confirmado' then
      new.confirmed_by := v_me;
      new.confirmed_at := now();
    else
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
  else
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger records_before
  before insert or update on public.records
  for each row execute function private.tg_records_before();

create or replace function private.tg_records_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, new.client_id, 'crear', 'record', new.id,
      jsonb_build_object('kind', new.kind, 'status', new.status));
    return null;
  end if;

  -- Solo los campos que cambiaron
  select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, n.value)
    into v_old, v_new
  from jsonb_each(to_jsonb(old)) o
  join jsonb_each(to_jsonb(new)) n using (key)
  where o.value is distinct from n.value
    and o.key not in ('updated_at');

  if v_old is null then
    return null;
  end if;

  insert into public.record_history (record_id, agency_id, client_id, changed_by, old_values, new_values)
  values (new.id, new.agency_id, new.client_id, private.member_id(new.agency_id), v_old, v_new);

  v_action := case
    when old.deleted_at is null and new.deleted_at is not null then 'eliminar'
    when old.deleted_at is not null and new.deleted_at is null then 'restaurar'
    when old.status <> 'confirmado' and new.status = 'confirmado' then 'confirmar'
    else 'editar'
  end;
  perform private.log_activity(new.agency_id, new.client_id, v_action, 'record', new.id, null);
  return null;
end;
$$;

create trigger records_after
  after insert or update on public.records
  for each row execute function private.tg_records_after();

-- =============================================================================
-- Seguridad: RLS, permisos de ejecución y funciones RPC públicas
-- =============================================================================
-- Matriz de permisos (documento de producto v0.2, sección 5):
--   admin        → toda la agencia
--   ejecutivo    → administra los clientes donde es responsable o suplente
--   colaborador  → ve y aporta (por confirmar) en clientes asignados
--   externo      → solo lectura en clientes asignados, sin consideraciones internas,
--                  con acceso que vence
-- No existen políticas DELETE: nada se borra físicamente desde la app.

-- Las políticas llaman a funciones del esquema private
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Nadie sin sesión toca estas tablas
revoke all on all tables in schema public from anon;

alter table public.agencies            enable row level security;
alter table public.agency_members      enable row level security;
alter table public.agency_invitations  enable row level security;
alter table public.clients             enable row level security;
alter table public.client_assignments  enable row level security;
alter table public.sources             enable row level security;
alter table public.records             enable row level security;
alter table public.record_history      enable row level security;
alter table public.activity_log        enable row level security;

-- -----------------------------------------------------------------------------
-- Agencias
-- -----------------------------------------------------------------------------
create policy "miembros ven su agencia" on public.agencies
  for select to authenticated
  using ((select private.member_id(id)) is not null);

create policy "admin edita su agencia" on public.agencies
  for update to authenticated
  using ((select private.is_admin(id)))
  with check ((select private.is_admin(id)));

-- -----------------------------------------------------------------------------
-- Miembros
-- -----------------------------------------------------------------------------
create policy "miembros ven a sus colegas" on public.agency_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.member_id(agency_id)) is not null
  );

create policy "admin da de alta miembros" on public.agency_members
  for insert to authenticated
  with check ((select private.is_admin(agency_id)));

create policy "admin edita y desactiva miembros" on public.agency_members
  for update to authenticated
  using ((select private.is_admin(agency_id)))
  with check ((select private.is_admin(agency_id)));

-- -----------------------------------------------------------------------------
-- Invitaciones (solo admin)
-- -----------------------------------------------------------------------------
create policy "admin ve invitaciones" on public.agency_invitations
  for select to authenticated using ((select private.is_admin(agency_id)));
create policy "admin crea invitaciones" on public.agency_invitations
  for insert to authenticated with check ((select private.is_admin(agency_id)));
create policy "admin edita invitaciones" on public.agency_invitations
  for update to authenticated
  using ((select private.is_admin(agency_id)))
  with check ((select private.is_admin(agency_id)));
create policy "admin cancela invitaciones" on public.agency_invitations
  for delete to authenticated using ((select private.is_admin(agency_id)) and accepted_at is null);

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
-- La política de lectura usa las columnas de la propia fila (no busca el cliente
-- por id) para que INSERT ... RETURNING funcione con el registro recién creado.
create policy "ver clientes permitidos" on public.clients
  for select to authenticated
  using (
    (select private.is_admin(agency_id))
    or (
      archived_at is null
      and (
        owner_member_id = (select private.member_id(agency_id))
        or backup_member_id = (select private.member_id(agency_id))
        or (select private.is_assigned(id))
      )
    )
  );

create policy "admin y ejecutivos crean clientes" on public.clients
  for insert to authenticated
  with check ((select private.member_role(agency_id)) in ('admin', 'ejecutivo'));

create policy "administrar clientes propios" on public.clients
  for update to authenticated
  using ((select private.can_manage_client(id)))
  with check ((select private.member_role(agency_id)) in ('admin', 'ejecutivo'));

-- -----------------------------------------------------------------------------
-- Asignaciones
-- -----------------------------------------------------------------------------
create policy "ver asignaciones de clientes visibles" on public.client_assignments
  for select to authenticated
  using ((select private.can_view_client(client_id)));

create policy "asignar personas a clientes propios" on public.client_assignments
  for insert to authenticated
  with check ((select private.can_manage_client(client_id)));

create policy "quitar personas de clientes propios" on public.client_assignments
  for delete to authenticated
  using ((select private.can_manage_client(client_id)));

-- -----------------------------------------------------------------------------
-- Fuentes
-- -----------------------------------------------------------------------------
create policy "ver fuentes de clientes visibles" on public.sources
  for select to authenticated
  using (
    (select private.can_view_client(client_id))
    and (deleted_at is null or (select private.is_admin(agency_id)))
  );

create policy "aportar fuentes" on public.sources
  for insert to authenticated
  with check ((select private.can_contribute_client(client_id)));

create policy "editar fuentes de clientes propios" on public.sources
  for update to authenticated
  using ((select private.can_manage_client(client_id)))
  with check ((select private.can_manage_client(client_id)));

-- -----------------------------------------------------------------------------
-- Registros del expediente
-- -----------------------------------------------------------------------------
create policy "ver registros de clientes visibles" on public.records
  for select to authenticated
  using (
    (select private.can_view_client(client_id))
    and (deleted_at is null or (select private.is_admin(agency_id)))
    and (not is_internal or (select private.member_role(agency_id)) <> 'externo')
  );

create policy "aportar registros" on public.records
  for insert to authenticated
  with check ((select private.can_contribute_client(client_id)));

create policy "confirmar y editar registros de clientes propios" on public.records
  for update to authenticated
  using ((select private.can_manage_client(client_id)))
  with check ((select private.can_manage_client(client_id)));

-- -----------------------------------------------------------------------------
-- Historial y bitácora (solo lectura; los escriben los triggers)
-- -----------------------------------------------------------------------------
create policy "ver historial de clientes propios" on public.record_history
  for select to authenticated
  using ((select private.can_manage_client(client_id)));

create policy "ver bitacora" on public.activity_log
  for select to authenticated
  using (
    (select private.is_admin(agency_id))
    or (client_id is not null and (select private.can_manage_client(client_id)))
  );

-- =============================================================================
-- Funciones RPC públicas
-- =============================================================================

-- Crea una agencia y deja al usuario actual como su administrador.
create or replace function public.create_agency(p_name text, p_full_name text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_agency uuid;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  insert into public.agencies (name) values (trim(p_name)) returning id into v_agency;

  insert into public.agency_members (agency_id, user_id, role, full_name, email)
  values (v_agency, v_uid, 'admin', p_full_name, lower((select auth.jwt()) ->> 'email'));

  return v_agency;
end;
$$;

-- Acepta las invitaciones pendientes dirigidas al correo del usuario actual.
create or replace function public.accept_invitations()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower((select auth.jwt()) ->> 'email');
  v_inv   record;
  v_count integer := 0;
begin
  if v_uid is null or v_email is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  for v_inv in
    select * from public.agency_invitations
    where lower(email) = v_email and accepted_at is null
    for update
  loop
    insert into public.agency_members (agency_id, user_id, role, full_name, email, access_expires_at)
    values (v_inv.agency_id, v_uid, v_inv.role, v_inv.full_name, v_email, v_inv.access_expires_at)
    on conflict (agency_id, user_id) do nothing;

    update public.agency_invitations set accepted_at = now() where id = v_inv.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.create_agency(text, text) from public, anon;
revoke all on function public.accept_invitations() from public, anon;
grant execute on function public.create_agency(text, text) to authenticated;
grant execute on function public.accept_invitations() to authenticated;

-- =============================================================================
-- Pruebas de permisos por rol (matriz de la sección 5 del documento de producto)
-- =============================================================================
-- Cómo correrlo: pega este archivo en el SQL Editor de Supabase o ejecútalo con
-- psql contra la base. Crea datos de prueba, simula a cada usuario y SIEMPRE
-- termina con un error intencional que deshace todo (no deja datos).
-- El mensaje final dice cuántas pruebas pasaron y lista cada una.
--
-- Usuarios simulados (agencia A salvo que se indique):
--   admin   → administrador
--   ej      → ejecutivo, responsable de C1
--   ej2     → ejecutivo, responsable de C2
--   col     → colaborador asignado a C1
--   ext     → externo asignado a C1
--   otro    → administrador de la agencia B
-- =============================================================================
do $$
declare
  u_admin uuid := gen_random_uuid();
  u_ej    uuid := gen_random_uuid();
  u_ej2   uuid := gen_random_uuid();
  u_col   uuid := gen_random_uuid();
  u_ext   uuid := gen_random_uuid();
  u_otro  uuid := gen_random_uuid();
  u_nuevo uuid := gen_random_uuid();
  u_inv   uuid := gen_random_uuid();

  ag_a uuid; ag_b uuid;
  m_admin uuid; m_ej uuid; m_ej2 uuid; m_col uuid; m_ext uuid;
  c1 uuid; c2 uuid; c3 uuid; c_nuevo uuid;
  r_int uuid; r_pub uuid; r_col uuid; r_c2 uuid;
  p1 uuid; p2 uuid;
  v_status public.record_status;
  v_uuid uuid;
  n int;
  ok boolean;

  total int := 0;
  fallas int := 0;
  rep text := '';
begin
  -- -------------------------------------------------------------------------
  -- Datos de prueba (como postgres, sin RLS)
  -- -------------------------------------------------------------------------
  insert into auth.users (id, email) values
    (u_admin, 'admin@a.mx'), (u_ej, 'ej@a.mx'), (u_ej2, 'ej2@a.mx'),
    (u_col, 'col@a.mx'), (u_ext, 'ext@a.mx'), (u_otro, 'otro@b.mx'),
    (u_nuevo, 'nuevo@c.mx'), (u_inv, 'invitado@a.mx');

  insert into public.agencies (name) values ('Agencia A') returning id into ag_a;
  insert into public.agencies (name) values ('Agencia B') returning id into ag_b;

  insert into public.agency_members (agency_id, user_id, role, email) values (ag_a, u_admin, 'admin', 'admin@a.mx') returning id into m_admin;
  insert into public.agency_members (agency_id, user_id, role, email) values (ag_a, u_ej, 'ejecutivo', 'ej@a.mx') returning id into m_ej;
  insert into public.agency_members (agency_id, user_id, role, email) values (ag_a, u_ej2, 'ejecutivo', 'ej2@a.mx') returning id into m_ej2;
  insert into public.agency_members (agency_id, user_id, role, email) values (ag_a, u_col, 'colaborador', 'col@a.mx') returning id into m_col;
  insert into public.agency_members (agency_id, user_id, role, email) values (ag_a, u_ext, 'externo', 'ext@a.mx') returning id into m_ext;
  insert into public.agency_members (agency_id, user_id, role, email) values (ag_b, u_otro, 'admin', 'otro@b.mx');

  insert into public.clients (agency_id, name, owner_member_id) values (ag_a, 'Cliente 1', m_ej) returning id into c1;
  insert into public.clients (agency_id, name, owner_member_id) values (ag_a, 'Cliente 2', m_ej2) returning id into c2;
  -- Al crear un cliente, archived_at siempre inicia vacío; se archiva con UPDATE
  insert into public.clients (agency_id, name, owner_member_id) values (ag_a, 'Cliente archivado', m_ej) returning id into c3;
  update public.clients set archived_at = now() where id = c3;

  insert into public.client_assignments (client_id, member_id) values (c1, m_col), (c1, m_ext);

  insert into public.records (client_id, kind, status, content, is_internal)
    values (c1, 'consideracion', 'confirmado', 'Cliente difícil con los pagos', true) returning id into r_int;
  insert into public.records (client_id, kind, status, content)
    values (c1, 'acuerdo', 'confirmado', 'Entregar 4 posts por semana') returning id into r_pub;
  insert into public.records (client_id, kind, status, content)
    values (c2, 'acuerdo', 'confirmado', 'Campaña de diciembre aprobada') returning id into r_c2;

  -- =========================================================================
  -- ADMIN
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated', 'email', 'admin@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.clients;
  total := total + 1;
  if n = 3 then rep := rep || E'\nOK    admin ve los 3 clientes de su agencia (incluido el archivado)';
  else fallas := fallas + 1; rep := rep || E'\nFALLA admin ve ' || n || ' clientes (esperado 3)'; end if;

  select count(*) into n from public.records;
  total := total + 1;
  if n = 3 then rep := rep || E'\nOK    admin ve todos los registros, incluidas consideraciones internas';
  else fallas := fallas + 1; rep := rep || E'\nFALLA admin ve ' || n || ' registros (esperado 3)'; end if;

  reset role;

  -- =========================================================================
  -- OTRA AGENCIA
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_otro, 'role', 'authenticated', 'email', 'otro@b.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.clients where agency_id = ag_a;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    admin de otra agencia no ve clientes de la agencia A';
  else fallas := fallas + 1; rep := rep || E'\nFALLA admin de otra agencia ve ' || n || ' clientes de A'; end if;

  ok := false;
  begin
    insert into public.records (client_id, kind, content) values (c1, 'acuerdo', 'intrusión');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    admin de otra agencia no puede escribir en un cliente ajeno';
  else fallas := fallas + 1; rep := rep || E'\nFALLA admin de otra agencia escribió en un cliente ajeno'; end if;

  reset role;

  -- =========================================================================
  -- EJECUTIVO (responsable de C1)
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_ej, 'role', 'authenticated', 'email', 'ej@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.clients;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    ejecutivo ve solo su cliente activo (no C2 ni el archivado)';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo ve ' || n || ' clientes (esperado 1)'; end if;

  update public.records set content = 'Entregar 5 posts por semana' where id = r_pub;
  get diagnostics n = row_count;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    ejecutivo edita un registro de su cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo no pudo editar su registro'; end if;

  select count(*) into n from public.record_history where record_id = r_pub;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    la edición queda en el historial y el ejecutivo lo ve';
  else fallas := fallas + 1; rep := rep || E'\nFALLA historial con ' || n || ' filas (esperado 1)'; end if;

  update public.records set content = 'cambio indebido' where id = r_c2;
  get diagnostics n = row_count;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    ejecutivo no puede editar registros de un cliente ajeno';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo editó un registro ajeno'; end if;

  ok := false;
  begin
    update public.records set deleted_at = now() where id = r_pub;
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    ejecutivo no puede eliminar registros';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo eliminó un registro'; end if;

  ok := false;
  begin
    update public.clients set archived_at = now() where id = c1;
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    ejecutivo no puede archivar clientes';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo archivó un cliente'; end if;

  ok := false;
  begin
    update public.clients set owner_member_id = m_ej2 where id = c1;
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    ejecutivo no puede cambiar al responsable del cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo cambió al responsable'; end if;

  update public.clients set backup_member_id = m_admin where id = c1;
  get diagnostics n = row_count;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    ejecutivo puede nombrar suplente de su cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo no pudo nombrar suplente'; end if;

  insert into public.clients (agency_id, name) values (ag_a, 'Cliente nuevo del ejecutivo') returning id, owner_member_id into c_nuevo, v_uuid;
  total := total + 1;
  if v_uuid = m_ej then rep := rep || E'\nOK    ejecutivo crea un cliente y queda como responsable';
  else fallas := fallas + 1; rep := rep || E'\nFALLA el cliente nuevo no quedó con el ejecutivo como responsable'; end if;

  ok := false;
  begin
    insert into public.client_assignments (client_id, member_id) values (c2, m_col);
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    ejecutivo no puede asignar personas a un cliente ajeno';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo asignó personas a un cliente ajeno'; end if;

  select count(*) into n from public.activity_log where client_id = c1;
  total := total + 1;
  if n > 0 then rep := rep || E'\nOK    ejecutivo ve la bitácora de su cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo no ve la bitácora de su cliente'; end if;

  ok := false;
  begin
    insert into public.agency_invitations (agency_id, email, role) values (ag_a, 'x@a.mx', 'colaborador');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    ejecutivo no puede invitar usuarios';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo invitó a un usuario'; end if;

  reset role;

  -- =========================================================================
  -- COLABORADOR (asignado a C1)
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_col, 'role', 'authenticated', 'email', 'col@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.clients;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    colaborador ve solo el cliente asignado';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador ve ' || n || ' clientes (esperado 1)'; end if;

  select count(*) into n from public.records where id = r_int;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    colaborador ve consideraciones internas de su cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador no ve consideraciones internas'; end if;

  insert into public.records (client_id, kind, status, content)
    values (c1, 'acuerdo', 'confirmado', 'Cambio de color pedido por WhatsApp')
    returning id, status into r_col, v_status;
  total := total + 1;
  if v_status = 'por_confirmar' then rep := rep || E'\nOK    lo que registra un colaborador queda por confirmar aunque pida confirmado';
  else fallas := fallas + 1; rep := rep || E'\nFALLA el registro del colaborador quedó ' || v_status; end if;

  update public.records set status = 'confirmado' where id = r_col;
  get diagnostics n = row_count;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    colaborador no puede confirmar registros';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador confirmó un registro'; end if;

  ok := false;
  begin
    insert into public.clients (agency_id, name) values (ag_a, 'Cliente del colaborador');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    colaborador no puede crear clientes';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador creó un cliente'; end if;

  select count(*) into n from public.activity_log;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    colaborador no ve la bitácora';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador ve ' || n || ' filas de bitácora'; end if;

  reset role;

  -- =========================================================================
  -- EJECUTIVO confirma lo del colaborador
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_ej, 'role', 'authenticated', 'email', 'ej@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.records set status = 'confirmado' where id = r_col;
  select confirmed_by into v_uuid from public.records where id = r_col;
  total := total + 1;
  if v_uuid = m_ej then rep := rep || E'\nOK    ejecutivo confirma lo del colaborador y queda registrado quién confirmó';
  else fallas := fallas + 1; rep := rep || E'\nFALLA confirmed_by incorrecto'; end if;

  reset role;

  -- =========================================================================
  -- PROYECTOS (permisos por cliente)
  -- =========================================================================
  insert into public.projects (client_id, name) values (c2, 'Proyecto de C2') returning id into p2;

  perform set_config('request.jwt.claims', json_build_object('sub', u_ej, 'role', 'authenticated', 'email', 'ej@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.projects (client_id, name) values (c1, 'Campaña de diciembre') returning id into p1;
  total := total + 1;
  if p1 is not null then rep := rep || E'\nOK    ejecutivo crea un proyecto en su cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo no pudo crear proyecto'; end if;

  ok := false;
  begin
    insert into public.projects (client_id, name) values (c2, 'Proyecto ajeno');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    ejecutivo no puede crear proyectos en un cliente ajeno';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo creó proyecto en cliente ajeno'; end if;

  select count(*) into n from public.projects;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    ejecutivo solo ve los proyectos de sus clientes';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo ve ' || n || ' proyectos (esperado 1)'; end if;

  ok := false;
  begin
    insert into public.records (client_id, project_id, kind, content) values (c1, p2, 'acuerdo', 'proyecto cruzado');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    un registro no puede usar el proyecto de otro cliente';
  else fallas := fallas + 1; rep := rep || E'\nFALLA se aceptó un proyecto de otro cliente'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_col, 'role', 'authenticated', 'email', 'col@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.projects where id = p1;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    colaborador ve los proyectos de su cliente asignado';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador no ve el proyecto'; end if;

  insert into public.records (client_id, project_id, kind, content) values (c1, p1, 'pendiente', 'Textos de diciembre');
  get diagnostics n = row_count;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    colaborador registra dentro de un proyecto';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador no pudo registrar en el proyecto'; end if;

  ok := false;
  begin
    insert into public.projects (client_id, name) values (c1, 'Proyecto del colaborador');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    colaborador no puede crear proyectos';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador creó un proyecto'; end if;
  reset role;

  -- =========================================================================
  -- EXTERNO (asignado a C1, solo lectura)
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_ext, 'role', 'authenticated', 'email', 'ext@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.clients;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    externo ve solo el cliente asignado';
  else fallas := fallas + 1; rep := rep || E'\nFALLA externo ve ' || n || ' clientes (esperado 1)'; end if;

  select count(*) into n from public.records where id = r_int;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    externo no ve consideraciones internas';
  else fallas := fallas + 1; rep := rep || E'\nFALLA externo ve una consideración interna'; end if;

  ok := false;
  begin
    insert into public.records (client_id, kind, content) values (c1, 'acuerdo', 'nota del externo');
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    externo no puede registrar información';
  else fallas := fallas + 1; rep := rep || E'\nFALLA externo registró información'; end if;

  reset role;

  select access_expires_at is not null into ok from public.agency_members where id = m_ext;
  total := total + 1;
  if ok then rep := rep || E'\nOK    el externo recibe fecha de vencimiento automática';
  else fallas := fallas + 1; rep := rep || E'\nFALLA el externo no tiene vencimiento'; end if;

  -- Acceso vencido
  update public.agency_members set access_expires_at = now() - interval '1 day' where id = m_ext;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ext, 'role', 'authenticated', 'email', 'ext@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.clients;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    externo con acceso vencido ya no ve nada';
  else fallas := fallas + 1; rep := rep || E'\nFALLA externo vencido ve ' || n || ' clientes'; end if;
  reset role;

  -- =========================================================================
  -- ADMIN: eliminar, restaurar, desactivar
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated', 'email', 'admin@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.records set deleted_at = now() where id = r_pub;
  get diagnostics n = row_count;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    admin elimina un registro';
  else fallas := fallas + 1; rep := rep || E'\nFALLA admin no pudo eliminar'; end if;

  select count(*) into n from public.records where id = r_pub;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    admin sigue viendo el registro eliminado (puede restaurarlo)';
  else fallas := fallas + 1; rep := rep || E'\nFALLA admin no ve el registro eliminado'; end if;

  update public.agency_members set active = false where id = m_col;

  ok := false;
  begin
    update public.agency_members set active = false where id = m_admin;
  exception when others then ok := true;
  end;
  total := total + 1;
  if ok then rep := rep || E'\nOK    el último administrador no puede desactivarse';
  else fallas := fallas + 1; rep := rep || E'\nFALLA la agencia se quedó sin administrador'; end if;

  insert into public.agency_invitations (agency_id, email, role, full_name) values (ag_a, 'INVITADO@a.mx', 'colaborador', 'Invitado');

  reset role;

  -- El ejecutivo ya no ve el registro eliminado
  perform set_config('request.jwt.claims', json_build_object('sub', u_ej, 'role', 'authenticated', 'email', 'ej@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.records where id = r_pub;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    ejecutivo deja de ver el registro eliminado';
  else fallas := fallas + 1; rep := rep || E'\nFALLA ejecutivo ve un registro eliminado'; end if;
  reset role;

  -- Colaborador desactivado
  perform set_config('request.jwt.claims', json_build_object('sub', u_col, 'role', 'authenticated', 'email', 'col@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.clients;
  total := total + 1;
  if n = 0 then rep := rep || E'\nOK    colaborador desactivado pierde el acceso';
  else fallas := fallas + 1; rep := rep || E'\nFALLA colaborador desactivado ve ' || n || ' clientes'; end if;
  reset role;

  select count(*) into n from public.records where id = r_col;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    los registros del colaborador desactivado se conservan';
  else fallas := fallas + 1; rep := rep || E'\nFALLA se perdieron registros del colaborador'; end if;

  -- =========================================================================
  -- Invitación y alta de agencia
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_inv, 'role', 'authenticated', 'email', 'invitado@a.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  select public.accept_invitations() into n;
  reset role;
  select count(*) into n from public.agency_members where user_id = u_inv and agency_id = ag_a and role = 'colaborador';
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    un invitado acepta su invitación y entra con el rol correcto';
  else fallas := fallas + 1; rep := rep || E'\nFALLA la invitación no creó al miembro'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_nuevo, 'role', 'authenticated', 'email', 'nuevo@c.mx')::text, true);
  perform set_config('role', 'authenticated', true);
  select public.create_agency('Agencia C', 'Nuevo') into v_uuid;
  select count(*) into n from public.agencies where id = v_uuid;
  reset role;
  total := total + 1;
  if n = 1 then rep := rep || E'\nOK    un usuario nuevo crea su agencia y queda como administrador';
  else fallas := fallas + 1; rep := rep || E'\nFALLA create_agency'; end if;

  -- =========================================================================
  -- Sin sesión
  -- =========================================================================
  perform set_config('role', 'anon', true);
  ok := false;
  begin
    perform 1 from public.clients;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  total := total + 1;
  if ok then rep := rep || E'\nOK    sin sesión no se puede leer nada';
  else fallas := fallas + 1; rep := rep || E'\nFALLA el rol anónimo leyó clientes'; end if;

  -- -------------------------------------------------------------------------
  -- Resultado (el error deshace todos los datos de prueba)
  -- -------------------------------------------------------------------------
  raise exception E'RESULTADO: % de % pruebas pasaron%', total - fallas, total, rep;
end $$;

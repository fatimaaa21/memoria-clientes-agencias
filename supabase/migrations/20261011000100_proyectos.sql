-- =============================================================================
-- Proyectos dentro de cada cliente
-- =============================================================================
-- Un cliente puede tener varios proyectos (campañas, lanzamientos, cuentas).
-- Un registro puede pertenecer a un proyecto o a ninguno: lo que no tiene
-- proyecto aplica a todo el cliente (típicamente las consideraciones).
-- Los permisos siguen siendo por cliente: quien ve el cliente ve sus proyectos.

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  archived_at  timestamptz,
  created_by   uuid references public.agency_members(id),
  created_at   timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);
create index projects_agency_idx on public.projects (agency_id);
create index projects_created_by_idx on public.projects (created_by);

alter table public.records add column project_id uuid references public.projects(id) on delete set null;
create index records_project_idx on public.records (project_id);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create or replace function private.tg_projects_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select c.agency_id into new.agency_id from public.clients c where c.id = new.client_id;
    new.created_by := coalesce(private.member_id(new.agency_id), new.created_by);
    new.archived_at := null;
  else
    new.agency_id  := old.agency_id;
    new.client_id  := old.client_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger projects_before
  before insert or update on public.projects
  for each row execute function private.tg_projects_before();

create or replace function private.tg_projects_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, new.client_id, 'crear', 'project', new.id,
      jsonb_build_object('name', new.name));
  elsif old.archived_at is null and new.archived_at is not null then
    perform private.log_activity(new.agency_id, new.client_id, 'archivar', 'project', new.id, null);
  elsif old.archived_at is not null and new.archived_at is null then
    perform private.log_activity(new.agency_id, new.client_id, 'restaurar', 'project', new.id, null);
  else
    perform private.log_activity(new.agency_id, new.client_id, 'editar', 'project', new.id,
      jsonb_build_object('name', new.name));
  end if;
  return null;
end;
$$;

create trigger projects_after
  after insert or update on public.projects
  for each row execute function private.tg_projects_after();

-- El proyecto de un registro debe pertenecer al mismo cliente
create or replace function private.tg_records_project_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
       select 1 from public.projects p where p.id = new.project_id and p.client_id = new.client_id) then
    raise exception 'El proyecto no pertenece a este cliente';
  end if;
  return new;
end;
$$;

-- Corre después de records_before (que fija client_id en updates)
create trigger records_project_check
  before insert or update of project_id, client_id on public.records
  for each row execute function private.tg_records_project_check();

grant execute on all functions in schema private to authenticated;
revoke all on all functions in schema private from public, anon;

-- -----------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------
revoke all on public.projects from anon;
alter table public.projects enable row level security;

-- Lectura con columnas de la propia fila para que INSERT ... RETURNING funcione
create policy "ver proyectos de clientes visibles" on public.projects
  for select to authenticated
  using (
    (select private.can_view_client(client_id))
    and (archived_at is null or (select private.is_admin(agency_id)) or (select private.can_manage_client(client_id)))
  );

create policy "crear proyectos en clientes propios" on public.projects
  for insert to authenticated
  with check ((select private.can_manage_client(client_id)));

create policy "editar y archivar proyectos de clientes propios" on public.projects
  for update to authenticated
  using ((select private.can_manage_client(client_id)))
  with check ((select private.can_manage_client(client_id)));

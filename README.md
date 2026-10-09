# Memoria por cliente para agencias

Base de datos y permisos del producto descrito en el *Documento de producto v0.2*: un expediente por cliente con acuerdos, consideraciones y pendientes, para agencias de marketing de 10 a 15 personas en México.

**Estado: sprint 1. Solo base de datos y permisos.** Todavía no hay interfaz ni IA.

## Qué incluye

| Carpeta | Contenido |
| --- | --- |
| `supabase/migrations/` | Esquema, funciones de permisos, triggers y políticas RLS. Ya aplicadas en el proyecto de Supabase `memoria-clientes-agencias` (`hmtjxixoqwxvxuuegzyp`). |
| `supabase/tests/permisos_test.sql` | 37 pruebas que verifican la matriz de permisos con usuarios simulados. |
| `types/database.types.ts` | Tipos de TypeScript generados desde la base, listos para Next.js. |

## Modelo de datos

```
agencies ─┬─ agency_members (usuario + rol)
          ├─ agency_invitations
          └─ clients ─┬─ client_assignments (colaboradores y externos)
                      ├─ sources (reunión, documento, texto, audio)
                      └─ records (acuerdo | consideración | pendiente)
                             └─ record_history
activity_log  ← bitácora de todo lo anterior (la escriben los triggers)
```

- **Nada se borra físicamente desde la app.** Los clientes se archivan, los registros y fuentes se marcan con `deleted_at` (el admin puede restaurarlos) y los miembros se desactivan.
- **Estados de un registro:** `por_confirmar` o `confirmado`. Se guarda quién confirmó y cuándo.
- **Consideraciones internas** (`is_internal`): no las ven los externos y no deben incluirse en minutas al cliente.

## Roles

| Rol | Alcance |
| --- | --- |
| `admin` | Toda la agencia: clientes, usuarios, invitaciones, eliminar y restaurar, archivar. |
| `ejecutivo` | Administra los clientes donde es responsable o suplente: confirma, edita, asigna personas. Puede crear clientes (queda como responsable). |
| `colaborador` | Ve y aporta en los clientes asignados. Todo lo que registra queda `por_confirmar`. |
| `externo` | Solo lectura en clientes asignados, sin consideraciones internas. Su acceso vence (90 días por omisión). |

Las reglas se aplican **en la base de datos** (RLS y triggers), no en la interfaz. Aunque alguien llame a la API directamente, no puede saltarse los permisos.

## Funciones RPC

```ts
// Usuario nuevo crea su agencia y queda como admin
await supabase.rpc('create_agency', { p_name: 'Agencia Ejemplo', p_full_name: 'Fa' })

// Usuario invitado acepta sus invitaciones pendientes (llamar después del login)
await supabase.rpc('accept_invitations')
```

## Cómo correr las pruebas

1. Abre el **SQL Editor** del proyecto en Supabase.
2. Pega el contenido de `supabase/tests/permisos_test.sql` y ejecútalo.
3. El resultado aparece como un error intencional: `RESULTADO: 37 de 37 pruebas pasaron`, con la lista de cada prueba. El error deshace todos los datos de prueba, así que no queda nada en la base.

Corre las pruebas cada vez que cambies una política o un trigger.

## Pendiente para los siguientes sprints

- **Sprint 2:** proyecto Next.js con login, alta de agencia, invitaciones, registro rápido y expediente por cliente.
- **Sprint 3:** subir documentos y generar la minuta con IA (Storage + extracción).
- Tarea programada que elimine definitivamente lo marcado como eliminado hace más de 30 días.
- Correo de invitación (hoy la invitación se guarda, pero no se envía).

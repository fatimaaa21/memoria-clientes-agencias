# Memoria por cliente para agencias

Base de datos y permisos del producto descrito en el *Documento de producto v0.2*: un expediente por cliente con acuerdos, consideraciones y pendientes, para agencias de marketing de 10 a 15 personas en México.

**Estado: sprint 2.** Base de datos, permisos e interfaz web (login, clientes, expediente, registro rápido, por confirmar y equipo). Todavía sin IA.

## Cómo correrlo

```bash
npm install
cp .env.example .env.local      # ya trae la URL y la clave pública del proyecto
npm run dev                     # con Supabase real → http://localhost:3000
npm run dev:demo                # modo demo con datos de ejemplo, sin cuentas
```

En el **modo demo** la barra lateral tiene un selector "Ver como" para recorrer la app con cada rol (administrador, ejecutivo, colaborador, externo). Los cambios viven mientras el servidor esté encendido. Sirve para probar y para mostrarlo a agencias.

### Antes del piloto con Supabase real

1. En Supabase → Authentication → URL Configuration, agrega la URL donde publiques la app (además de `http://localhost:3000`) a **Site URL** y **Redirect URLs**.
2. Configura un **SMTP propio** (por ejemplo Resend) en Authentication → Emails. El correo incluido en Supabase solo permite unos cuantos envíos por hora y los enlaces mágicos dejarán de llegar.
3. **Plantillas de correo (obligatorio para que funcionen los enlaces):** en Authentication → Emails → Templates, cambia el enlace de **Magic Link** y de **Confirm signup** por:
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Entrar a Memoria</a>
   ```
   Así el enlace funciona aunque se abra en otro navegador o dispositivo, y sirve igual para entrar y para invitaciones.
4. Para invitar a alguien: el admin lo registra en **Equipo** y la app le envía un correo con su enlace. Al entrar, la invitación se acepta sola.

## Pantallas

| Ruta | Qué hace |
| --- | --- |
| `/login` | Entrar con enlace por correo o con contraseña. |
| `/bienvenida` | Primera vez: acepta invitaciones pendientes o crea la agencia. |
| `/clientes` | Lista de clientes visibles; nuevo cliente en panel lateral. |
| `/clientes/[id]` | Expediente: consideraciones vigentes arriba, línea de tiempo filtrable, registro rápido, detalle con confirmar/editar/historial y equipo del cliente. |
| `/proyectos/[id]` | Proyecto de un cliente: consideraciones del cliente arriba y solo los registros del proyecto. Se crean con el "+" de la barra lateral o desde el expediente. |
| `/por-confirmar` | Cola del ejecutivo: todo lo que debe validar de sus clientes, con confirmación en lote. |
| `/equipo` | Personas y roles; el admin invita y quita o devuelve el acceso. |

## Sistema de diseño

Minimalista tipo documento, definido en `app/globals.css` con variables CSS (modo claro y oscuro automático).

- **Color solo con significado:** azul = acuerdo, ámbar = consideración, violeta = pendiente.
- **Estado por forma, no solo por color:** marca llena = confirmado; anillo punteado = por confirmar.
- **Paneles laterales** para acciones cortas; páginas completas para leer (el expediente).
- Tipografía: DM Sans (incluida en el paquete, sin depender de Google Fonts).

## Qué incluye

| Carpeta | Contenido |
| --- | --- |
| `supabase/migrations/` | Esquema, funciones de permisos, triggers y políticas RLS. Ya aplicadas en el proyecto de Supabase `memoria-clientes-agencias` (`hmtjxixoqwxvxuuegzyp`). |
| `supabase/tests/permisos_test.sql` | 44 pruebas que verifican la matriz de permisos con usuarios simulados. |
| `types/database.types.ts` | Tipos de TypeScript generados desde la base. |
| `app/`, `components/` | Interfaz en Next.js 15 (App Router, Server Actions). |
| `lib/data/` | Acceso a datos: `supabase.ts` (real) y `demo.ts` (datos de ejemplo en memoria). |
| `lib/permissions.ts` | Qué botones mostrar según el rol. La seguridad real está en la base. |

## Modelo de datos

```
agencies ─┬─ agency_members (usuario + rol)
          ├─ agency_invitations
          └─ clients ─┬─ client_assignments (colaboradores y externos)
                      ├─ projects (campañas; opcional en cada registro)
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
3. El resultado aparece como un error intencional: `RESULTADO: 44 de 44 pruebas pasaron`, con la lista de cada prueba. El error deshace todos los datos de prueba, así que no queda nada en la base.

Corre las pruebas cada vez que cambies una política o un trigger.

## Pendiente para los siguientes sprints

- **Sprint 3:** subir documentos y generar la minuta con IA (Storage + extracción).
- Tarea programada que elimine definitivamente lo marcado como eliminado hace más de 30 días.
- Vista de bitácora para el admin y restaurar registros eliminados desde la interfaz.

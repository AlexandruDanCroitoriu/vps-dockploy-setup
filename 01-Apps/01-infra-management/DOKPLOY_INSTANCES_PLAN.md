# Multiple Dockploy Instances Implementation Plan

> Status: implemented. This document records the intended behavior and design;
> `AGENTS.md`, the current schema migrations, and the tests are authoritative for
> future changes.

## Goal

Allow the single administrator to configure multiple Dockploy instances, select
the active instance from a dropdown above the sidebar user menu, and store the
configuration in a persistent SQLite database.

The first-run experience must work without `DOKPLOY_URL` or
`DOKPLOY_API_KEY`. When no Dockploy instance is selected, the Dashboard presents
the setup form, the Projects menu is hidden, and Dockploy-dependent pages are
not available.

## User experience

### First run

When the administrator signs in and no Dockploy instances have been configured:

1. The sidebar instance selector shows **Add new Dockploy**.
2. The Projects menu is not rendered.
3. Direct navigation to `/projects` or any nested project/service route returns
   the administrator to `/`.
4. The application does not attempt to request projects from Dockploy.
5. The Dashboard displays a setup form with:
   - Instance name
   - Root domain
   - Computed Dockploy URL
   - API/CLI key
6. Submitting the form validates the connection before saving it.
7. A successful save selects the new instance, enables the Projects menu, and
   refreshes the Dashboard.

### Configured state

The instance dropdown appears immediately above the existing user and theme
controls. Its first option is always **Add new Dockploy**, followed by all
configured instances. The active instance is visually identified.

Selecting another instance navigates to `/projects`. This prevents project or
service IDs belonging to the previous instance from remaining in the URL while
immediately showing the selected instance's projects.

Selecting **Add new Dockploy** navigates to the Dashboard and opens or focuses
the instance form. It clears the active instance selection, so the Projects menu
and project tree are unavailable until an instance is selected again or a new
instance has been validated and saved successfully.

The Dashboard form follows the selector state:

- When **Add new Dockploy** is selected, show a blank creation form.
- When a configured instance is selected, show an edit form populated with its
  current name and URL.
- In edit mode, populate the API/CLI key as a masked field with an explicit
  show/hide control and copy button so the authenticated administrator can
  reveal, copy, or replace it.

## Data model

Use one SQLite table initially:

```sql
CREATE TABLE dokploy_instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_url TEXT NOT NULL UNIQUE,
  root_domain TEXT NOT NULL,
  api_key TEXT NOT NULL,
  default_service_username TEXT NOT NULL,
  default_service_password TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Use UUIDs for `id` and ISO-8601 UTC timestamps for date fields.

`root_domain` is the administrator-entered source value and contains no
protocol, port, path, query, or fragment. `root_url` is computed as
`https://dockploy.<root_domain>`. The form displays the editable root domain
beside the read-only computed Dockploy URL.

The active instance is not stored globally in SQLite. Store its ID in an
HTTP-only cookie named `active_dokploy_id`. This keeps secrets out of browser
storage and allows each browser session to retain its own selection.

If the cookie is absent or refers to a deleted instance, treat the application
as having no selected Dockploy. Do not silently select the first configured
instance; the administrator must make an explicit selection from the sidebar.

## Credential handling

API keys are exposed only to the authenticated Dashboard edit form for the
selected instance. They must not be included in sidebar summaries, general API
responses, logs, or error messages.

Store API keys as plaintext in SQLite. No additional credential-encryption
environment variable is required. Security therefore depends on restricting
access to the database file, its containing directory, the persistent volume,
container shell access, and backups. The database must not be committed to the
repository or exposed through a downloadable application route.

Only pass safe summaries to the UI:

```ts
type DokployInstanceSummary = {
  id: string;
  name: string;
  rootUrl: string;
  rootDomain: string;
};
```

The Dashboard server component may pass the selected instance key to the edit
form. Treat that form as sensitive authenticated UI and keep the key masked
until the administrator explicitly reveals it.

Never log API keys, complete database rows containing credentials, or
environment-variable values.

## Storage architecture

Use `better-sqlite3` with explicit, small SQL migrations. Add a server-only
storage layer:

```text
lib/storage/
├── database.ts
├── migrations.ts
└── dokploy-instances.ts
```

Responsibilities:

- `database.ts`: resolve the database path, open the connection, and configure
  safe SQLite pragmas.
- `migrations.ts`: maintain a schema-version table and apply migrations in a
  transaction.
- `dokploy-instances.ts`: validate storage inputs and expose safe instance
  queries and mutations without returning API keys to UI-facing callers.

The built-in production database path is
`/app/data/infra-management.sqlite`. It does not require an environment
variable. A locally running development copy uses
`data/infra-management.sqlite` inside the repository, while tests override the
path internally to use isolated temporary databases.

Add these patterns to `.gitignore`:

```gitignore
/data/*.sqlite
/data/*.sqlite-*
```

The second rule excludes journal, WAL, and shared-memory sidecar files.

Production must mount persistent Dockploy application storage at `/app/data`.
This application is deployed from a locally running Infra Management instance
through the repository application picker using `01-Apps/01-infra-management`.
Ignoring the database in Git does not protect it from being erased during a
container redeployment.

## Active-instance resolution

Add a server-only module such as:

```text
lib/dokploy/active-instance.ts
```

The request path becomes:

```text
Page / Server Action / route handler
              |
              v
Read active_dokploy_id cookie
              |
              v
Load the SQLite record
              |
              v
Dokploy client sends x-api-key request
```

Update `lib/dokploy/client.ts` so `dokployRequest()` obtains the active
configuration asynchronously instead of reading `DOKPLOY_URL` and
`DOKPLOY_API_KEY` directly. Existing feature functions such as
`getDokployProjects()` should retain their current public signatures where
possible.

Keep resolution centralized. Pages, actions, and API handlers must not select
instances independently, because that could send related operations to
different Dockploy servers.

## Server Actions

Add authenticated Server Actions for:

- Creating an instance
- Selecting an instance
- Updating an instance (either in the initial implementation or the next
  increment)
- Deleting an instance (either in the initial implementation or the next
  increment)

Every action is a directly reachable server endpoint and must:

1. Verify the NextAuth session independently.
2. Treat all form values and IDs as untrusted input.
3. Read authoritative records back from SQLite.
4. Return only safe error messages and DTOs.

### Creating an instance

The creation action should:

1. Trim and validate the instance name.
2. Normalize the root domain and compute the Dockploy URL as
   `https://dockploy.<root-domain>`.
3. Validate the API key without exposing it in error output.
4. Test the connection using a harmless endpoint such as `project.all`.
5. Insert the key only after the connection succeeds.
6. Set `active_dokploy_id` as an HTTP-only, same-site cookie.
7. Revalidate affected pages and redirect to `/`.

### Domain and URL normalization

The administrator enters only the root domain, for example `example.com`. The
application computes the complete Dockploy URL as
`https://dockploy.example.com` and does not allow the URL to be edited directly.

Normalization must:

- Lowercase the root domain and remove a single trailing dot.
- Reject protocols, ports, paths, queries, fragments, and invalid domain labels.
- Store the normalized domain and its computed canonical URL so the unique
  constraint catches duplicates.

### Selecting an instance

The selection action should confirm the supplied ID exists, set the cookie, and
redirect to `/`. The cookie should contain only the opaque instance ID, never a
URL or API key.

## Layout and sidebar changes

The dashboard layout currently loads Dockploy projects unconditionally. Change
it to:

1. Load safe instance summaries.
2. Resolve the active instance.
3. Load projects only when an active instance exists.
4. Pass the summaries and active ID to `DashboardShell`.

Add an instance-selector Client Component to the dashboard-shell feature. Reuse
it in both desktop and mobile sidebars and position it above the existing
user/theme row.

Project reloads performed by `/api/dokploy/projects` will automatically use the
active cookie through the centralized client. The route must retain its own
session check. When there is no active instance, it must return an explicit
non-success response without contacting Dockploy.

Render the Projects navigation item and project tree only when an active
instance exists. The Dashboard item and instance selector remain available in
all states.

Add a guard at the `app/(dashboard)/projects` layout boundary. If no active
instance exists, redirect `/projects` and every nested project/service page to
`/`. This makes the Projects area unavailable even when a URL is entered
directly; hiding the menu alone is not an access boundary.

The sidebar should distinguish these states:

- No configured instances and no selection
- Configured instances but no active selection
- Active and connected
- Active but unreachable
- Project list failed to load

Connection failure must not delete or silently replace the selected instance.

## Dashboard changes

Keep the route page small and compose it from feature components.

The Dashboard should contain:

- A prominent setup form when no instances exist.
- An add-instance form or dialog when instances already exist.
- A compact summary of the current instance.
- A default service credentials section. These plaintext username/password
  values prefill login fields for services such as DBGate.
- A trash button in the upper-right of the selected instance card. It requires
  confirmation, removes only the local SQLite record, clears the active
  selection, and does not modify the remote Dockploy server.
- Clear connection-validation and save errors that never include response
  bodies or credentials.

Use existing `components/ui` primitives for inputs, buttons, form fields,
dialogs, and selects before introducing new styling.

## Migration from environment configuration

Support a backward-compatible one-time bootstrap for existing deployments:

1. If SQLite has no instances and both `DOKPLOY_URL` and `DOKPLOY_API_KEY` are
   present, import them once.
2. Use `DOKPLOY_NAME` when present; otherwise derive a display name from the
   URL hostname.
3. Store the imported key in the same plaintext database field used by instances
   created from the Dashboard.
4. Do not import again after a database record exists.
5. After verifying the persistent database, remove the old URL/key environment
   variables from the deployment.

Authentication and GitHub repository environment variables remain unchanged.

Document that SQLite files, persistent-volume snapshots, and backups contain
plaintext Dockploy API keys and must be protected accordingly.

## Implementation sequence

1. Add the SQLite dependency, ignored data paths, and environment documentation.
2. Implement database opening, schema migrations, and temporary-database tests.
3. Implement safe instance data-access functions that keep API keys server-only.
4. Implement root-domain validation, computed URLs, and connection testing.
5. Implement active-instance cookie resolution.
6. Refactor the Dokploy transport to use the resolved instance.
7. Add authenticated create/select actions.
8. Make the dashboard layout safe when no instance exists.
9. Add the sidebar selector for desktop and mobile layouts.
10. Add the Dashboard configuration form and current-instance summary.
11. Add optional edit/delete management if included in the first release.
12. Add environment-variable bootstrap and update deployment documentation.
13. Run the complete verification suite and test with a persistent Dockploy
    volume.

## Verification

Add automated coverage for:

- Root-domain normalization, computed URLs, and rejected domain forms.
- Form validation and duplicate instances.
- SQLite migrations and CRUD using temporary database files.
- Ensuring safe summaries do not contain API keys.
- Ensuring API keys are never serialized by UI-facing data-access functions.
- Missing, valid, and stale active-instance cookies.
- Server Action authentication.
- Failed connection checks without credential leakage.
- Dashboard empty and configured states.
- Sidebar ordering: **Add new Dockploy** first, then configured instances.
- Projects navigation hidden when no instance is selected.
- Direct project and service URLs redirecting to `/` when no instance is
  selected.
- No project API request occurring without an active instance.
- Switching instances and returning to `/`.
- Project requests using the selected instance.
- One-time import from legacy environment variables.

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

For the production acceptance test:

1. Mount a persistent volume at `/app/data`.
2. Add two Dockploy instances.
3. Switch between them and verify each project list.
4. Redeploy the application.
5. Confirm both records and the selected-instance behavior remain intact.

## Decisions and assumptions

- The application remains private, single-administrator, single-replica, and
  server-connected to Dockploy.
- “Root domain” means only the base domain, such as `example.com`; the Dockploy
  URL is always computed as `https://dockploy.<root-domain>`.
- One API/CLI key is stored per Dockploy instance.
- Instance selection is per browser through an HTTP-only cookie.
- No instance is selected implicitly; a missing or stale selection cookie keeps
  all Projects navigation and routes unavailable.
- API keys are intentionally stored as plaintext in SQLite and protected through
  filesystem, persistent-volume, host, and backup access controls.
- SQLite data must live on a persistent production volume.
- Switching instances opens `/projects` to avoid cross-instance resource
  identifiers and immediately show the selected instance's projects.

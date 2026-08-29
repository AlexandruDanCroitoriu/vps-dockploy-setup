# Infra Management

Infra Management is a private, single-user Next.js dashboard for operating multiple Dockploy instances. It provides project and service browsing, GitHub-backed application creation, environment editing, deployments and stored logs, database creation and credentials, and domain/DNS management.

The Add application dropdown discovers directories under `01-Apps`; selecting one opens a dialog that configures the repository, branch, monorepo build and watch paths, build type, automatic deployments, and an optional HTTPS domain. It uses an installed Dokploy GitHub provider when available and otherwise falls back to the public Git HTTPS URL. Private deployment sources require a Dokploy GitHub provider.

## Architecture

- Next.js 16 App Router with React Server Components and Server Actions
- NextAuth.js v4 Credentials authentication
- Server-only Dokploy API integration under `lib/dokploy/`
- Tailwind CSS 4, Headless UI, Monaco Editor, and React Log Viewer

The provisioning state sequence, operational URL rules, persistence boundaries,
and code ownership are documented in [docs/instance-lifecycle.md](docs/instance-lifecycle.md).

The authenticated Home page can export all Dockploy instance and provisioning
state as JSON or transactionally replace it from a compatible export. These
files contain plaintext API keys and credentials and must be handled like the
SQLite database itself.

## Required environment variables

Copy `.env.example` to `.env.local` for local development and configure:

- `INFRA_SERVICES_DEFAULT_USERNAME`: Infra Management login name and default
  service/initial Dockploy administrator email used for new instances
- `INFRA_SERVICES_DEFAULT_PASSWORD`: Infra Management login password and default
  service, initial Dockploy administrator, and root SSH password for new instances
- `AUTH_SECRET`: stable random secret used to encrypt session JWTs
- `NEXTAUTH_URL`: public application URL
- `CLOUDFLARE_API_TOKEN`: server-only Cloudflare API token with `Zone:Read` and
  `DNS:Write` permissions, used to manage accessible domains and subdomains on
  the Cloudflare page
- `RESEND_API_KEY`: server-only full-access Resend key used to provision each
  active instance domain. The key is never copied to Dokploy projects; Infra
  Management creates a restricted sending key for each Vendure project instead.

Dockploy root domains, API/CLI keys, and default service login credentials are
configured from the authenticated Dashboard. The selected instance's values
prefill service forms such as DBGate. Keys and service credentials are stored as
plaintext in SQLite, so restrict access to the application, database file,
persistent volume, snapshots, and backups. The database and its sidecar files
are excluded from Git. Production defaults to
`/app/data/infra-management.sqlite`; no database-path environment variable is
required. A locally running development copy uses
`data/infra-management.sqlite` inside the repository.

Existing deployments may temporarily keep `DOKPLOY_URL`, `DOKPLOY_API_KEY`, and
optional `DOKPLOY_NAME`. If the database is empty, the application imports them
once. The imported instance must then be selected from the sidebar.

The application dropdown uses the repository application manifest in
`lib/github/repository-applications.ts`. This avoids runtime GitHub API access
and does not require a `GITHUB_TOKEN`. Add new `01-Apps` folders to that manifest
when they should appear in the dropdown. Each manifest application can be
deployed only once per Dockploy instance, regardless of which project contains
it. Applications backed by a Zot image remain unavailable until their required
`latest` image can be verified in the active instance's registry.

The Vendure repository entry is a dependent application group. Deploy its
backend first from `online-store-vendure-server:latest` in the active
instance's Zot registry. It is created as `vendure` on port 3000 with
`vendure.<root-domain>` as its default hostname, inherits database and storage
variables from the Dockploy project environment, and receives generated cookie
settings plus the active instance's default service username and password as
its superadmin credentials.
Creating Garage initializes a `vendure-assets` bucket and dedicated access key,
then adds `ASSET_URL_PREFIX`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` to that project environment.
Deleting the last Garage service removes those managed values. Vendure backend
creation copies all six storage values from the project into its service
environment.
Once the backend has a domain and is running, the storefront entries become
available when their matching `latest` image is also present in Zot. Storefronts
are created from `online-store-vendure-storefront:latest` or
`online-store-vendure-storefront-clean:latest`, use port 3000, and default to the
folder hostname (`storefront.<root-domain>` or
`storefront-clean.<root-domain>`). Infra Management signs in to the backend's
Admin API server-side, loads its channels, and configures each storefront with
the selected channel token and Shop API URL. The superadmin credentials are
never returned to the browser.

The project service-template menu also provides a **Complete Vendure stack**
option. One confirmation creates and starts PostgreSQL, Garage with its WebUI,
the Vendure backend, `storefront-clean`, and `storefront` in dependency order.
It generates a shared default channel token before startup, so both storefronts
can be configured without waiting for the backend Admin API. Redis is not part
of this stack because the backend uses Vendure's PostgreSQL-backed default job
queue.

Generate the authentication secret with `openssl rand -base64 32`. Keep `AUTH_SECRET` unchanged between deployments; rotating it signs out the current session.

## Local development

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run check
npm run build
```

Unit and component tests use Vitest and React Testing Library. Playwright starts a local test server for the login tests. Install its browser and Linux dependencies once with `npx playwright install --with-deps chromium`; connected Dokploy workflow tests run when `E2E_DOKPLOY=1`, `E2E_BASE_URL`, `E2E_USERNAME`, and `E2E_PASSWORD` are configured.

### Project Docker image builds

The authenticated `Projects` page lists directories under the repository's
`01-Apps` folder. Projects with a `Dockerfile` can be built as production images
and pushed to the Zot registry on the active Dokploy instance. Local development
uses the existing checkout. Generated production deployments enable a managed
checkout at `/app/data/repository`, clone the public repository on first access,
fast-forward it when the Projects page is first opened after a process start,
and update it again with the **Refresh projects** button.

1. Create and deploy the Zot service on the active Dokploy instance, with an
   enabled HTTPS domain.
2. Start the dashboard with `npm run dev`, open `Projects`, choose an image tag,
   select `Build`, and then select `Push` when the build succeeds.

Each project card lists locally built Docker tags and their creation dates.
Every build has a push button for each configured instance with an available
Zot registry. Local tags can be deleted from the build list; deleting the
current image requires explicit confirmation.

Build and push operations run as process-local background jobs, so navigation
does not interrupt them. Returning to Projects restores their running or final
state and refreshes the image inventories when they finish. Restarting the local
development server clears the displayed job history and interrupts active jobs.

Local builds of Infra Management create a consistent SQLite backup and embed it
as an image seed. On first startup with an empty `/app/data` volume, the container
copies that seed to the production database path. Existing persistent databases
are never overwritten by a newer image. The seed contains stored credentials, so
access to the image and private Zot registry is equivalent to access to the local
database.

Before replacing `latest`, a build preserves the previous local image under one
immutable `build-<UTC timestamp>` tag. The new image is tagged only as `latest`.
Pushing publishes older local builds under their immutable tags before updating
Zot's single `latest` tag, so each inventory contains one current image plus
versions retained from earlier builds or pushes.

Projects with component Dockerfiles under `apps/*/Dockerfile` expose one image
target per component on the Projects page. The Vendure repository exposes
one `server` backend target plus `storefront` and `storefront-clean` targets;
future storefront directories with their own Dockerfile are discovered
automatically. The Vendure backend runs its server and worker together in the
same Dockploy application through the repository's `npm start` command
(`vendure start all`), so it uses one image repository and deploys as one unit.

Local images use `<project-name>:<tag>` and pushed images use
`<zot-domain>/<project-name>:<tag>`; a leading numeric folder prefix such as
`01-` is removed. Push authenticates with the active instance's stored default
service credentials, which are also used when the Zot service is created.
Generated Infra Management deployments install Git and the Docker CLI, create a
persistent `infra-management-data` volume at `/app/data`, and bind-mount the host
Docker socket. Project routes remain disabled in other production deployments
unless `PROJECT_BUILDS_ENABLED=true` is explicitly configured. Access to the
Docker socket is equivalent to administrative access to the VPS; retain the
single trusted-administrator security boundary.

## Deploy with Dockploy

This application is intended to be deployed from a locally running copy of
Infra Management using the repository application picker.

1. In the local Infra Management dashboard, choose this repository application:
   `01-Apps/01-infra-management`.
2. Use the Node/Next.js build type, run `npm run build`, and start with `npm start`.
   The repository pins Nixpacks to Node 22 and includes the native build tools
   required by `better-sqlite3`; no extra build environment variables are needed.
3. When created from the repository application picker, the app automatically
   uses the active instance's default service credentials and generates its
   `INFRA_SERVICES_DEFAULT_USERNAME`, `INFRA_SERVICES_DEFAULT_PASSWORD`,
   `AUTH_SECRET`, and `NEXTAUTH_URL`. For a manually
   created deployment, configure every required environment variable yourself.
   The generated environment also forwards the current dashboard's server-only
   `CLOUDFLARE_API_TOKEN` and server-only `RESEND_API_KEY` so Cloudflare and
   Resend domain management are available in the deployed copy.
4. Expose port `3000`, attach the public domain, and enable HTTPS.
5. Mount persistent application storage at `/app/data`. The application writes
   `/app/data/infra-management.sqlite` automatically. Without that mount,
   configured instances are lost when the container is replaced.
6. Keep one replica. Login throttling is process-local and SQLite is not shared
   between replicas.

Each configured Dockploy API URL must be reachable from the application
container. API keys remain server-only and must never use a `NEXT_PUBLIC_`
prefix.

### Bootstrap a new VPS

The Add Dockploy instance form can provision a new Ubuntu or Debian VPS. Saving
the form stores the instance before provisioning begins. The setup panel then
enables one sequential step at a time; run each step manually, or enable
Automatic to continue with each next step after the previous one succeeds.
Configure the root domain's apex A record in Cloudflare first, then leave the
API/CLI key empty. The form loads the root domain and VPS IP from Cloudflare and
verifies that the root domain resolves to that IP. The local server uses the
default service password for root SSH,
updates installed APT packages, installs Dokploy with the official installer,
creates the first Dokploy administrator using the default service credentials,
assigns the HTTPS domain, generates an API/CLI key, and stores the verified
instance.

Use an email address for the default service username during provisioning.
Password SSH must be enabled for `root`. The VPS IP and default service password are stored
in the secret-bearing instance configuration in SQLite for future server
operations. Use a DNS-only apex Cloudflare A record so the root domain resolves
to the origin VPS rather than a Cloudflare edge. Provisioning can take several
minutes and may fail when ports 80, 443,
or 3000 are already occupied, the DNS record has not propagated, or the server
requires a reboot to finish package upgrades.

## Security and troubleshooting

- All pages and API routes are protected except login and framework assets. Future API route handlers must still check the session explicitly.
- Five failed logins from one client IP within 15 minutes trigger a 15-minute lockout. Restarting the process clears this state.
- Never log credentials or environment values, and never commit `.env` files.
- If every login fails after deployment, verify both uppercase
  `INFRA_SERVICES_DEFAULT_*` environment variables are configured consistently.
- If Dokploy data cannot load, verify the URL, API key, container network reachability, and application logs.

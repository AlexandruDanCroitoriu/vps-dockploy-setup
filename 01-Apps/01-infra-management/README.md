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

## Required environment variables

Copy `.env.example` to `.env.local` for local development and configure:

- `ADMIN_USERNAME`: administrator login name
- `infra_services_default_username`: default service and initial Dockploy
  administrator email used for new instances
- `infra_services_default_password`: default service, initial Dockploy
  administrator, and root SSH password used for new instances
- `ADMIN_PASSWORD_HASH`: bcrypt password hash with cost 12
- `AUTH_SECRET`: stable random secret used to encrypt session JWTs
- `NEXTAUTH_URL`: public application URL

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
when they should appear in the dropdown.

Generate an escaped password hash for a Next.js environment file:

```bash
node -e 'console.log(require("bcryptjs").hashSync("replace-with-a-strong-password", 12).replaceAll("$", "\\$"))'
```

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

### Local Docker image builds

In local development, the authenticated `Projects` page lists directories under
the repository's `01-Apps` folder. Projects with a `Dockerfile` can be built as
production images and pushed to the Zot registry on the active Dokploy instance.

1. Create and deploy the Zot service on the active Dokploy instance, with an
   enabled HTTPS domain.
2. Start the dashboard with `npm run dev`, open `Projects`, choose an image tag,
   select `Build`, and then select `Push` when the build succeeds.

Each project card lists locally built Docker tags and their creation dates next
to the Zot repository's published tags. The newest Zot tag is marked current;
older tags are shown as previous versions. Individual local and Zot tags can be
deleted from their respective lists. Deleting the current image requires an
explicit confirmation; previous versions are removed immediately.

Before replacing `latest`, a build preserves the previous local image under one
immutable `build-<UTC timestamp>` tag. The new image is tagged only as `latest`.
Pushing publishes older local builds under their immutable tags before updating
Zot's single `latest` tag, so each inventory contains one current image plus
versions retained from earlier builds or pushes.

Local images use `<project-name>:<tag>` and pushed images use
`<zot-domain>/<project-name>:<tag>`; a leading numeric folder prefix such as
`01-` is removed. Push authenticates with the active instance's stored default
service credentials, which are also used when the Zot service is created. The
page, navigation item, and actions are disabled outside development.

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
   `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`, and `NEXTAUTH_URL`. For a manually
   created deployment, configure every required environment variable yourself.
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
Automatic to continue with each next step after the previous one succeeds. Create
the Cloudflare DNS record for `dockploy.<root-domain>` first, then leave the
API/CLI key empty. The local server uses the default service password for root
SSH, resolves the VPS IP from the domain,
updates installed APT packages, installs Dokploy with the official installer,
creates the first Dokploy administrator using the default service credentials,
assigns the HTTPS domain, generates an API/CLI key, and stores the verified
instance.

Use an email address for the default service username during provisioning.
Password SSH must be enabled for `root`. The VPS IP and default service password are stored
in the secret-bearing instance configuration in SQLite for future server
operations. If the IP is omitted, the application resolves
`dockploy.<root-domain>` and stores the resulting address; use a DNS-only
Cloudflare record so this resolves to the origin VPS rather than a Cloudflare
edge. Provisioning can take several minutes and may fail when ports 80, 443,
or 3000 are already occupied, the DNS record has not propagated, or the server
requires a reboot to finish package upgrades.

## Security and troubleshooting

- All pages and API routes are protected except login and framework assets. Future API route handlers must still check the session explicitly.
- Five failed logins from one client IP within 15 minutes trigger a 15-minute lockout. Restarting the process clears this state.
- Never log credentials or environment values, and never commit `.env` files.
- If every login fails after deployment, verify that environment-variable expansion did not alter the bcrypt hash.
- Dokploy variables should normally use the raw bcrypt hash. Authentication also
  accepts the `\$`-escaped form used in Next.js environment files.
- If Dokploy data cannot load, verify the URL, API key, container network reachability, and application logs.

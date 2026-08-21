# Infra Management

Infra Management is a private, single-user Next.js dashboard for operating a Dokploy instance. It provides project and service browsing, GitHub-backed application creation, environment editing, deployments and stored logs, database creation and credentials, and domain/DNS management.

The Add application dropdown discovers directories under `01-Apps`; selecting one opens a dialog that configures the repository, branch, monorepo build and watch paths, build type, automatic deployments, and an optional HTTPS domain. It uses an installed Dokploy GitHub provider when available and otherwise falls back to the public Git HTTPS URL. Private deployment sources require a Dokploy GitHub provider.

## Architecture

- Next.js 16 App Router with React Server Components and Server Actions
- NextAuth.js v4 Credentials authentication
- Server-only Dokploy API integration under `lib/dokploy/`
- Tailwind CSS 4, Headless UI, Monaco Editor, and React Log Viewer


## Required environment variables

Copy `.env.example` to `.env.local` for local development and configure:

- `ADMIN_USERNAME`: administrator login name
- `ADMIN_PASSWORD_HASH`: bcrypt password hash with cost 12
- `AUTH_SECRET`: stable random secret used to encrypt session JWTs
- `NEXTAUTH_URL`: public application URL
- `DOKPLOY_URL`: base URL of the Dokploy instance, without `/api`
- `DOKPLOY_API_KEY`: API key created in Dokploy for this application

The application dropdown reads folders from GitHub. Its repository defaults to
this monorepo and can be changed with `GITHUB_REPOSITORY_OWNER`,
`GITHUB_REPOSITORY_NAME`, `GITHUB_REPOSITORY_BRANCH`, and `GITHUB_APPS_PATH`.
Set the server-only `GITHUB_TOKEN` when the repository is private; it only needs
read access to repository contents.

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

## Deploy with Dokploy

1. Create an application from this repository and select this project directory as the build context.
2. Use the Node/Next.js build type, run `npm run build`, and start with `npm start`.
3. Configure every required environment variable. Set `NEXTAUTH_URL` to the final HTTPS URL.
4. Expose port `3000`, attach the public domain, and enable HTTPS.
5. Keep one replica. Login throttling is process-local and is not shared between replicas.

The Dokploy API URL must be reachable from the application container. The API key is server-only and must never use a `NEXT_PUBLIC_` prefix.

## Security and troubleshooting

- All pages and API routes are protected except login and framework assets. Future API route handlers must still check the session explicitly.
- Five failed logins from one client IP within 15 minutes trigger a 15-minute lockout. Restarting the process clears this state.
- Never log credentials or environment values, and never commit `.env` files.
- If every login fails after deployment, verify that environment-variable expansion did not alter the bcrypt hash.
- If Dokploy data cannot load, verify the URL, API key, container network reachability, and application logs.

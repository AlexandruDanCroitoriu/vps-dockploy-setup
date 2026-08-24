<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Infra Management agent guide

This directory contains a private, single-administrator dashboard for operating a
Dokploy instance. Preserve its deliberately small operational model: one trusted
administrator, one application replica, and server-side access to Dokploy.

## Before making changes

- Read `README.md` for setup, deployment, environment, and troubleshooting details.
- Inspect the working tree before editing.
- For Next.js behavior, follow the generated rule above and read the relevant guide
  under `node_modules/next/dist/docs/` before writing framework code.
- Never print, copy into source, or expose values from `.env` files.

## Architecture map

- `app/(auth)/` contains the public login experience.
- `app/(dashboard)/` contains authenticated pages and the dashboard shell.
- `app/(dashboard)/projects/` is a development-only view of local `01-Apps`
  directories and may invoke the already-authenticated local Docker CLI to build
  and push production images. Keep its route, navigation, and actions unavailable
  outside development.
- `app/(dashboard)/dokploy/_actions/` contains authenticated Server Actions split
  by projects, services, databases, and domains. Shared action state, authentication,
  and safe error conversion live in `shared.ts`.
- `app/(dashboard)/dokploy/_components/` contains project UI grouped by feature.
  Keep route files small and compose them from these feature components.
- `app/api/` contains route handlers. Every non-auth route must independently verify
  the session even though `proxy.ts` also protects it.
- `components/ui/` contains small reusable UI primitives. Extend these before
  duplicating dialog, form-control, button, or status styles in feature components.
- `lib/dokploy/` is the server-only Dokploy integration. Transport belongs in
  `client.ts`, safe API errors in `errors.ts`, response normalization in
  `normalizers.ts`, validation in `validators.ts`, and endpoint-specific operations
  in their corresponding feature modules.
- `lib/logs/` contains pure deployment-log parsing and formatting.
- `lib/storage/` owns the SQLite connection, ordered schema migrations, and
  Dockploy-instance persistence. Keep summary queries separate from
  secret-bearing configuration queries. The database contains plaintext API
  keys and service credentials and must retain private filesystem permissions.
- `tests/e2e/` contains Playwright browser tests. Unit and component tests are
  colocated with the source they cover.

## Dockploy instance boundaries

- The active instance ID is stored in the HTTP-only `active_dokploy_id` cookie.
- Use `getActiveDokployInstanceSummary()` for guards, navigation, IDs, names,
  URLs, and domains. Use `getActiveDokployConfiguration()` only when a server
  operation or authenticated credential-editing form genuinely needs secrets.
- Never add API keys or default service passwords to instance summary queries,
  sidebar props, general route-handler responses, logs, or error messages.
- Project routes and APIs require an explicitly selected instance; do not add an
  implicit first-instance fallback.
- Post-create deployment fields use
  `components/ui/deploy-after-create-option.tsx`, and the corresponding actions
  use the shared deployment helpers in `projects/_actions/shared.ts`.
- Every new SQLite migration must include an upgrade-path test starting from the
  previous schema, plus an idempotency check.

## Authentication architecture

- This is intentionally a single-user application deployed as one Dockploy/Next.js replica. Do not add user registration, a user database, Redis, OAuth providers, roles, or multi-user behavior unless the user explicitly changes that requirement.
- Authentication uses NextAuth.js v4 with its Credentials provider. The shared configuration and all in-memory login-rate-limit logic live in `auth.ts`.
- `app/api/auth/[...nextauth]/route.ts` exposes the NextAuth GET and POST handlers. The custom sign-in UI is `app/(auth)/login/page.tsx`, and dashboard sign-out uses `signOut()` from `next-auth/react`.
- Credentials come from server-only environment variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `AUTH_SECRET`. Never expose them through `NEXT_PUBLIC_*`, commit `.env`, log their values, or replace the bcrypt hash with a plaintext password.
- `ADMIN_PASSWORD_HASH` is a bcrypt hash with cost 12. Literal `$` characters must be escaped as `\$` when the hash is stored in a Next.js `.env` file because Next.js expands unescaped dollar signs. See `.env.example` for the safe generation command. Environment variables configured directly in Dockploy normally use the unescaped hash.
- Sessions use encrypted JWT cookies with an eight-hour maximum age. `AUTH_SECRET` must be a strong random value and must remain consistent between deployments; rotating it intentionally invalidates all existing sessions.
- `proxy.ts` protects all application pages and future API paths, redirects unauthenticated requests to `/login`, and leaves only `/login`, `/api/auth/*`, Next.js static/image assets, and the favicon public. Keep its custom `pages.signIn` value synchronized with `auth.ts`.
- Login attempts are limited in memory by client IP: five failures within 15 minutes cause a 15-minute lockout, and successful authentication clears the record. This is appropriate only while Dockploy runs one application replica. The limiter resets on process/container restart.
- Future API route handlers must verify that a valid session exists before returning data or performing actions. The single authenticated user has full access; unauthenticated callers have none. Keep this explicit check even though `proxy.ts` also protects routes.

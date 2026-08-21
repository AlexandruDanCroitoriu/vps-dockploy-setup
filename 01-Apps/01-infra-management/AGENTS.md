<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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

# Dockploy instance lifecycle

This dashboard stores an instance before it performs any remote operation. The
single administrator can then run the provisioning steps manually or allow the
browser to continue automatically.

## State sequence

```text
draft form
  -> saved instance
  -> operating system updated
  -> Dokploy installed and running
  -> administrator created
  -> HTTPS domain configured
  -> API key generated and verified (Dokploy navigation becomes available)
  -> Main project created (sidebar project becomes available)
  -> Zot deployed and running
  -> complete
```

Only the first incomplete step may run. Starting a step changes the durable job
state to `running` inside a SQLite transaction. A second request is rejected
until the first request completes or fails. Success advances the job to
`waiting` (or `complete` after Zot); failure records the step as `error` and
allows that same step to be retried.

## Addresses

- `rootUrl` is the public `https://dockploy.<root-domain>` URL shown to users.
- During provisioning, server operations use `http://<vps-ip>:3000` because DNS
  and TLS may not yet be reachable from the Infra Management container.
- Server-side Dokploy API operations prefer the public HTTPS URL. If transport
  setup fails (for example, DNS or certificate issuance is incomplete), they
  fall back to the direct VPS address. HTTP/API errors are not retried through
  the fallback, so invalid credentials and real Dokploy errors stay visible.

## Persistence and secrets

- `dokploy_instances` contains the durable instance configuration.
- `dokploy_provisioning_jobs` contains step state and bounded logs.
- API keys, VPS passwords, and default service credentials are plaintext
  server-side secrets. Never expose them through summaries, client props other
  than the authenticated credential form, logs, or error messages.
- Removing an instance removes its provisioning job and logs, but does not
  uninstall software or delete resources on the VPS.

## Code ownership

- `lib/storage/dokploy-provisioning.ts`: durable state and legal transitions.
- `lib/vps/bootstrap-dokploy.ts`: remote Dokploy/VPS step operations.
- `lib/dokploy/bootstrap-zot.ts`: idempotent Main-project and Zot operations.
- `app/api/dokploy-instances/bootstrap/route.ts`: authentication, request
  validation, and orchestration.
- `app/(dashboard)/_components/dokploy-instances/`: instance form and progress
  presentation.

When adding a step, update the canonical list in
`lib/vps/bootstrap-progress.ts`, add a storage migration if persisted state
changes, and cover ordering, failure, retry, and completion behavior.

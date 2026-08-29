---
type: patch
areas:
  - authentication
  - platform.next
---

## Intent

Support the locale-free `/verify` URL emitted by the Vendure transactional email configuration.

## Invariants

- Existing verification links keep their query string when redirected.
- Verification is handled by the default-locale verification page.
- Localized verification URLs continue to work directly.

## Integration guidance

Keep an explicit temporary redirect from `/verify` to the default locale's verification route when changing routing or locale middleware.

## Verification

- Open `/verify?token=test` and confirm it redirects to `/en/verify?token=test`.
- Open `/en/verify?token=test` and confirm the verification page renders.

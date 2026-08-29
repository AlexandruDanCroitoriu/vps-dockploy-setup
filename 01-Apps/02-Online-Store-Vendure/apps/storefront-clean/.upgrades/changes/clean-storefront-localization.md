---
type: minor
areas:
  - collections
  - platform.i18n
  - site
---

## Intent

Make the cleaned storefront collection-first and serve Romanian and English, with Romanian as the default locale.

## Invariants

- The locale layout owns the shared desktop/mobile navigation and footer.
- The home page displays every top-level Vendure collection.
- Search, product/collection detail, authentication, and customer account flows remain reachable.
- Romanian is the default locale and English remains selectable.

## Integration guidance

Preserve downstream branding and commerce behavior while retaining the collection grid, shared site chrome, and the `ro`/`en` locale configuration.

## Verification

- Run message parity tests and type checking.
- Build the production storefront.
- Check `/ro`, `/ro/search`, and the account routes at desktop and mobile widths.

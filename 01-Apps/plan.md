# Code Audit and Restructuring Plan

## Objective

Audit these four applications for duplicated code, unused code, and confusing file organization, then safely restructure them for better readability and maintainability without changing intended behavior:

1. `01-infra-management`
2. `02-Online-Store-Vendure/apps/server`
3. `02-Online-Store-Vendure/apps/storefront`
4. `02-Online-Store-Vendure/apps/storefront-clean`

The audit will cover duplication **within each application**. It will also compare `storefront` and `storefront-clean`, but their shared/generated baseline will not automatically be treated as removable duplication: the reason the two applications are maintained separately must be preserved unless a shared-package or single-source strategy is explicitly approved.

## Safety and success rules

- Begin from the verified clean commit on `main`; keep each audit/refactoring batch isolated and reviewable so any new working-tree change has a clear origin.
- Establish a passing baseline before refactoring. Record existing failures separately so they are not mistaken for regressions.
- Treat compiler/linter output and import analysis as leads, not proof. Remove code only after checking static imports, dynamic imports, framework conventions, configuration references, scripts, tests, assets, and runtime entry points.
- Refactor in small, reviewable batches, keeping behavior changes out of structural commits.
- Prefer ownership-based modules and clear public entry points over generic `utils`, `helpers`, or oversized shared folders.
- Do not extract code merely because it looks similar. Consolidate only when the copies have the same responsibility and are expected to evolve together.
- Respect each app's `AGENTS.md`, framework conventions, security boundaries, and generated/upgrade-managed files.
- Never expose or copy secrets from `.env` files during the audit.

## Deliverables

- An audit inventory for each app listing:
  - confirmed duplicate implementations;
  - intentional or acceptable similarities that should remain separate;
  - confirmed unused files, exports, dependencies, assets, styles, translations, GraphQL operations, and tests;
  - oversized or misplaced modules and dependency-boundary problems;
  - proposed target locations and extraction boundaries;
  - risk, confidence, and validation required for each finding.
- Implemented removals and refactors, grouped into small logical changes.
- Updated tests and documentation where module ownership or public imports change.
- A final before/after report with removed files/exports/dependencies, consolidated code, adopted structure changes, deferred proposals, and verification results.

## Phase 1 — Baseline and repository map

- [x] Verify the starting working tree is clean and all previous work is committed (`main`, verified before the audit begins).
- [x] Record starting commit `e96ec0679f2e4c6046ae689da5553021f84cb70d` so all audit and refactoring changes can be compared against an exact baseline.
- [ ] Read the four app guides, READMEs, architecture documents, TypeScript/ESLint configuration, package scripts, Docker files, workspace configuration, and upgrade metadata.
- [ ] For both Next.js codebases, consult the installed Next.js documentation for any routing, server/client boundary, caching, middleware/proxy, and file-convention behavior relevant to a proposed change.
- [ ] Inventory source files, tests, scripts, static assets, generated files, environment/config references, and runtime entry points while excluding `node_modules`, `.next`, `dist`, coverage, and other generated output.
- [ ] Record dependency graphs and module boundaries, including dynamic imports, barrel exports, path aliases, workspace imports, Vendure plugin registration, Next.js special files, GraphQL documents, translations, and upgrade-managed storefront files.
- [ ] Run each app's existing validation commands and save a baseline of pass/fail results.

### Baseline commands

- Infra management: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`; use targeted Playwright tests where affected behavior has E2E coverage.
- Vendure server: `npm run build -w server` plus any targeted server tests that exist or are added for changed behavior.
- Each storefront: `npm run upgrade:validate`, `npm test`, `npm run lint`, `npm run check-types`, and `npm run build` from that storefront workspace.

## Phase 2 — Duplicate-code analysis

- [ ] Detect exact and near-exact duplication using file hashes, normalized text comparisons, clone detection, and targeted searches for repeated components, actions, validation, data mapping, error handling, configuration, styles, and test setup.
- [ ] Review every candidate manually and classify it as:
  - consolidate now;
  - similar by design and keep separate;
  - generated/vendor/upgrade-managed and do not edit directly;
  - defer because consolidation would create coupling or alter behavior.
- [ ] For approved consolidation, identify the correct owning feature/module, define its public API, list consumers, and verify server/client and security boundaries before editing.

### App-specific duplicate checks

- **Infra management:** repeated authenticated Server Action boilerplate, Dokploy request/error normalization, deploy-after-create logic, service/application/compose UI patterns, dialogs/forms/status displays, route-handler guards, registry/image handling, and duplicated test fixtures.
- **Vendure server:** repeated server/worker bootstrap and environment parsing, S3/asset configuration, email configuration/templates, plugin options, and shared runtime configuration. Preserve different server and worker responsibilities where required by Vendure.
- **Storefront:** repeated route wrappers, loading/skeleton states, form/action result handling, pagination and product-list queries, order summaries, locale/channel/currency resolution, GraphQL fragments, navigation controls, and repeated message keys or styles.
- **Storefront clean:** run the same independent checks as storefront; do not assume a finding in one automatically applies to the other.
- **Storefront comparison:** produce a path-by-path comparison of `storefront` and `storefront-clean`, separating upstream baseline files from intentional customization. Propose shared packages, templates, or upgrade-flow improvements only when ownership and independent deployment/versioning consequences are clear.

## Phase 3 — Unused-code analysis

- [ ] Use TypeScript, ESLint, dependency analysis, and import/reference searches to find unused locals, exports, modules, packages, scripts, assets, CSS, translations, GraphQL operations/fragments, tests, and stale configuration.
- [ ] Trace possible runtime-only references before deletion: Next.js route conventions and metadata, dynamic imports, Vendure decorators/plugin registration, email templates and partials, Docker/CI references, public asset URLs, scripts, and string-based lookup paths.
- [ ] Classify candidates by confidence:
  - high: demonstrably unreachable and unreferenced;
  - medium: apparently unused but dependent on framework/runtime conventions;
  - low: externally consumed, generated, reflective, or operationally invoked.
- [ ] Remove only high-confidence items immediately. Validate medium-confidence candidates with targeted tests or runtime checks first. Document low-confidence items instead of deleting them.
- [ ] After dependency removal, update the correct `package.json` and lockfile through the package manager and verify that workspace resolution remains valid.

## Phase 4 — File-structure and architecture proposals

- [ ] Measure oversized files, mixed responsibilities, deep relative imports, circular dependencies, cross-feature internal imports, ambiguous names, and code placed outside its owning feature.
- [ ] Create a current-to-proposed path map for each structural change, including import migration order and compatibility needs.
- [ ] Rank proposals by benefit, risk, and effort; distinguish changes safe to implement now from broader architectural decisions requiring approval.

### Target principles by app

- **Infra management:** keep Next.js route files thin; keep authenticated actions grouped by Dokploy domain; extend `components/ui` before adding feature-local primitive copies; retain transport, errors, normalizers, validators, and endpoint operations in their documented `lib/dokploy` roles; keep secret-bearing storage queries isolated from summaries.
- **Vendure server:** keep bootstrap files minimal; put custom behavior in focused plugins; separate typed configuration/environment parsing from plugin registration; colocate each plugin's entities, services, API extensions, and tests.
- **Both storefronts:** keep `src/app` as thin route adapters; organize substantial logic under its owning `src/features` module; access other features only through explicit top-level public modules; keep GraphQL operations and translations with their feature; retain platform integrations under `src/platform` and site composition under `src/site`.
- **Shared storefront code:** evaluate a workspace package only for truly synchronized, domain-neutral code. Do not create a shared dumping ground or undermine the storefront upgrade protocol.

## Phase 5 — Implementation sequence

- [ ] Create an evidence-backed findings table before edits, with file paths, rationale, proposed action, confidence, risk, and validation.
- [ ] Remove unused imports, locals, exports, and isolated files in small batches.
- [ ] Remove unused dependencies and stale configuration only after code removals are verified.
- [ ] Consolidate low-risk duplicates inside each app, adding characterization tests first where behavior is insufficiently covered.
- [ ] Apply approved file moves and module-boundary improvements; update imports, tests, docs, and storefront upgrade notes as required.
- [ ] Refactor higher-risk server/runtime, authentication, storage, checkout, payment, deployment, and cross-storefront concerns last and separately.
- [ ] Format only touched files where practical to avoid unrelated churn.

## Phase 6 — Verification after every batch

- [ ] Run targeted tests for changed modules first.
- [ ] Run the affected app's lint and type checks.
- [ ] Run the affected app's complete test suite.
- [ ] Run its production build.
- [ ] For storefront changes, also run architecture, i18n, and upgrade-protocol validation.
- [ ] For sensitive flows, perform or add focused checks for authentication, Dokploy actions, storage migrations, Vendure server/worker startup, product browsing, cart, checkout, account, locale/channel/currency behavior, and email template rendering as applicable.
- [ ] Compare the final results with the baseline and investigate every new warning or failure.

## Phase 7 — Final review and handoff

- [ ] Re-run duplicate and unused-code scans to confirm the intended reduction and detect newly orphaned code.
- [ ] Review the final diff for accidental behavior changes, generated artifacts, secrets, broad formatting churn, and overlap with the user's pre-existing work.
- [ ] Confirm documentation, architecture notes, and storefront upgrade notes match the resulting structure.
- [ ] Produce per-app metrics: files/lines/dependencies removed, duplicate groups consolidated, tests added or changed, and remaining deferred findings.
- [ ] Provide a concise final report containing validation results, known limitations, and prioritized next steps.

## Definition of done

The task is complete when all four apps have been independently audited; every removal or consolidation has traceable evidence; approved low- and medium-risk improvements are implemented; required checks pass or pre-existing failures are clearly documented; intentional duplication is explained; proposed but deferred structure changes include actionable path maps and tradeoffs; and no existing user work, secrets, generated baselines, framework conventions, or intended behavior have been damaged.

---
name: pre-commit-project-assessment
description: Assess a repository's commit readiness, architecture, duplication, correctness, tests, documentation, security boundaries, and AI-maintainability. Use before committing or when asked for a project-health review; report findings without changing code unless fixes are separately requested.
---

# Pre-commit Project Assessment

Produce an evidence-based review that helps keep the repository safe to commit and easy for future human and AI contributors to understand. Assessment is the default; do not edit files, stage changes, commit, or expand scope unless the user separately asks.

## Establish context

- Read every applicable `AGENTS.md` and the repository's primary setup and architecture documentation.
- Inspect the complete working tree: staged, unstaged, and relevant untracked files. Never read or print secrets from environment files, credential stores, databases, or generated artifacts.
- Identify the requested change's purpose, affected execution paths, architectural boundaries, and important invariants before judging the implementation.
- Inspect surrounding callers, tests, types, persistence or API boundaries, and error paths. Do not review only the visible diff when correctness depends on unchanged code.
- If generated or vendored framework documentation is authoritative for the installed version, follow the repository instructions for consulting it.

## Assess commit readiness

Use judgment rather than mechanically filling a checklist. Cover the areas that could materially affect this change:

- Correctness: expected behavior, edge cases, concurrency, stale state, partial failure, validation, and error handling.
- Architecture: responsibility placement, dependency direction, repository conventions, abstraction boundaries, and consistency with the documented operating model.
- Duplication: repeated logic or UI that creates realistic drift risk. Do not recommend abstraction merely because two small fragments look similar.
- Security and privacy: authentication and authorization, secret-bearing versus summary data, injection risks, unsafe logging, data exposure, filesystem permissions, and destructive operations.
- Data and API integrity: migrations and upgrade paths, idempotency, schema compatibility, endpoint contracts, normalization, and failure semantics.
- Maintainability: naming, cohesion, type safety, discoverability, comments that explain non-obvious constraints, dead code, and avoidable complexity.
- AI-readiness: whether repository guidance and nearby code let a new agent recover the architecture and invariants accurately; flag stale maps, undocumented conventions, misleading names, and hidden coupling.
- Verification: relevant static checks, focused tests, broader test suites, build checks, and missing coverage proportional to risk. Run safe repository-defined checks when practical; explain anything not run.
- Change hygiene: accidental files, debugging remnants, unrelated edits, generated noise, formatting problems, dependency or lockfile drift, and `git diff --check` failures.

Avoid speculative rewrites. Distinguish defects from optional improvements and distinguish newly introduced issues from pre-existing or out-of-scope concerns.

## Understanding check

Before giving a verdict, summarize concisely:

- the project's purpose and operating model;
- what the current change does end to end;
- the boundaries and invariants it must preserve;
- any remaining unknowns that limit confidence.

Treat unresolved misunderstandings as assessment findings when they could make the commit unsafe. Never claim perfect or complete understanding when evidence is incomplete.

## Report format

Lead with findings ordered by severity: blocker, high, medium, then low. For each finding, include:

- a concrete description of the problem and its impact;
- clickable file and line references when available;
- the evidence or scenario that demonstrates it;
- the smallest reasonable remediation direction.

Then provide:

1. **Commit verdict:** `Not ready`, `Ready with follow-ups`, or `Ready`.
2. **Project understanding:** the concise understanding check above.
3. **Verification:** commands run and outcomes, plus checks not run and why.
4. **Follow-ups:** only worthwhile non-blocking improvements, clearly separated from commit blockers.

If no findings exist, state that explicitly, but still mention residual risks and verification limits. A `Ready` verdict means no material issue was found within the inspected scope; it is not a guarantee of perfection.

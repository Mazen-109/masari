# Specification Quality Checklist: Academic Catalog & Student Roster

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-19
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validation run 1 (2026-11-19): one item failed — "No implementation details leak": FR-014, FR-033, and
  SC-003 pointed at files under `contracts/`. The pointers were removed (column aliases, encodings, and the
  module interface are specified in the plan's contracts, not in the spec).
- Validation run 2 (2026-11-19): all items pass.
- Interactive clarification was replaced by eleven assumptions under "Clarifications → Session 2026-11-19",
  each marked "(assumed, owner to confirm)" and listed for the owner in the feature summary.
- "UTF-8", "byte-order mark", and "CSV" stay in FR-014: they are the names Excel and the college's systems
  show to the user when saving a file, i.e. product behaviour, not implementation detail. Likewise the
  numeric limits of FR-014, FR-016, and SC-002 (2 MB, 10,000 rows, 500 listed problems, 10 s) are stated on
  purpose so that they are testable.
- Cross-artifact analysis (speckit-analyze checks, run by hand, 2026-11-19) found and fixed: `courseStudents`
  (needs the official-list table for `verified`) was scheduled before that table existed — moved from PR-10
  to PR-13 in catalog-read.md, db-api.md, and tasks.md; T059 said "five changes" of server-actions.md §6
  although the fifth is T027; db-api.md §4 lacked the `student-profiles.int.test.ts` row and the
  "no staged rows with problems" CHECK that tasks.md tests. No uncovered requirement, no constitution
  violation beyond the principle VI exception recorded in plan.md Complexity Tracking.
- Planning review (2026-11-19, CHANGES_REQUESTED) — all items addressed:
  - Apply writes each set with one `unnest()` statement, so the statement count is really fixed (data-model
    §3.7; test compares 10 and 2,000 rows).
  - The verification FK includes `tenant_id`; a cross-college same-code link is tested.
  - Impostor path closed: `namesMatch` now needs the first min(|O|, 3) official names in the account name;
    re-verification after a rename is rate-limited (5/day); a catalog manager can revoke any verification
    (`revoked_user_id` blocks automatic re-linking); edge-case text fixed (FR-022, FR-026, US5 scenario 10).
  - Dynamic-id screens use `prepare` hooks with fixtures in the role-based access college (routes.md §1.1).
  - PR-13 split into "roster tables + lock" (PR-13) and "import repository" (PR-14); the module reads it
    held were deferred (YAGNI) or moved to their first consumer (`verificationOf`, PR-21). 22 batches.
  - Non-blocking: lock taken by `studentProfiles.update` on changed values and landing in PR-13; FR-028 rule
    (official-name change only) applied in the plan; `expired` order; levels re-check; invisible characters,
    NFKC, code case; `meta.columns` encoding; past-term semantics; YAGNI deferral of `courseStudents`,
    `groupSizes`, `listedStudents`, `knowledgeCourses` (catalog-read.md §5, with the review's notes);
    owner sign-off moved to this docs PR; body limit listed as a 001 change and weighed; size estimates
    raised; daily purge tracked in `docs/roadmap.md` (003); explicit isolation read/write tests;
    normalised overview search; types exported once; test-support refusal tests in
    `test-support.int.test.ts`; second confirmation for large removals.
- FR-029 changes the privacy-notice draft of feature 001 (D17 there): the owner reviews the wording before
  the pilot.

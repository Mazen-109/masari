# Repository settings — owner checklist

GitHub settings that cannot live in the repository. The workflow they protect is
`.github/workflows/ci.yml` (contract: `specs/001-platform-foundation/contracts/ci.md`). The repository needs
**no GitHub secrets** for feature 001.

## 1. Protect `main`

Settings → Branches (or Rules → Rulesets) → rule for `main`:

- [ ] Require a pull request before merging.
- [ ] Require status checks to pass before merging, and require branches to be up to date.
- [ ] Do not allow force pushes; do not allow deletion.
- [ ] Settings → General → Pull Requests: allow **squash merging only** (turn off merge commits and rebase
      merging).

## 2. Required status checks

A check can only be required once the job exists on `main`; a required check that never reports blocks
every pull request.

- [ ] **After PR-2 is merged**: mark `quality`, `test`, `build`, `secrets`, and `audit` as required.
- [ ] **Only after PR-10 is merged**: add `e2e` as required. Do not add it earlier — PR-3 … PR-9 have no
      `e2e` job to wait for.

If the `e2e` job is later split into shards (contracts/ci.md §2), the required check name stays `e2e`.

## 3. Security features

Settings → Code security (where available for the repository's plan and visibility):

- [ ] Dependabot alerts: on (Dependabot version updates come from `.github/dependabot.yml`).
- [ ] Secret scanning: on.
- [ ] Push protection: on.

## 4. When `audit` fails on an upstream advisory

This applies when a high-severity advisory is published against a dependency already on `main`,
unrelated to the batch being reviewed (contracts/ci.md §2):

1. **A fixed version exists** → open a separate dependency PR (`chore(deps): …`, outside the batch
   sequence, same review and merge rule) that updates the package — directly, or through `pnpm.overrides`
   for a transitive dependency. Merge it first; the batch then rebases on `main`.
2. **No fixed version exists** → the implementer does not add an ignore entry and does not change the
   audit command. The orchestrator stops and asks the owner, giving the advisory id, the affected package,
   and whether Masari's code reaches the vulnerable path. The owner chooses: wait for the fix, replace the
   dependency, or amend the constitution to allow a recorded, time-boxed exception.

The `audit` gate is never made optional, skipped, or run with a lower level to get a pull request merged.

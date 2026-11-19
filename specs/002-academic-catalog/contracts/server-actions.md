# Contract: Server Actions (additions and changes)

**Feature**: `002-academic-catalog` · Extends `specs/001-platform-foundation/contracts/server-actions.md`.
Everything in its §1 (shape, order of work, audit in the same transaction, unknown exceptions → `internal`
with `errorName`/`sqlState` only, translated codes, trimming), §2 (rate-limit helper), and §6 (test
obligations, forged submissions) applies unchanged.

## 1. Result codes

`ErrorCode` gains `profile_locked` (a verified student's academic data; the UI explains that it comes from
the official list).

`FieldErrorCode` gains: `term_exists`, `date_order`, `file_empty`, `file_too_large`, `file_type`,
`file_encoding`, `file_malformed`, `missing_columns`, `duplicate_columns`, `too_many_rows`. Existing codes are
reused: `code_taken` (course code), `too_many` (topics, teachers), `out_of_range`, `invalid_choice`,
`invalid_format`, `required`, `too_long`.

`conflict` carries `meta.reason` where the user needs to know which state blocked the action:
`expired` | `has_issues` | `not_draft` | `levels_changed` | `large_removal` (imports; `large_removal` also
carries `meta.removed` and `meta.current`), `course_inactive` (teacher assignment), `not_mismatch` |
`not_verified` (verification).

**Lists in `meta`**: `ActionFailure.meta` is `Record<string, string | number>` (001 `lib/result.ts`), so a
list is sent as **one string of canonical keys joined by commas**, without spaces, in a fixed order — e.g.
`meta.columns = 'student_code,division'` for `missing_columns` / `duplicate_columns`. The UI splits on `,`
and translates each key (`roster.columns.<key>`). Keys never contain commas.

## 2. Rate-limit policy addition

| Purpose | Key | Limit |
|---|---|---|
| `roster-upload` | per acting user id | 30 / 3600 s |
| `profile-verify` | per student user id | 5 / 86400 s — counts only the automatic verification attempt after a name change (§6, `updateAccountAction`); when exhausted, the name is still saved and the attempt is skipped (logged as `roster.verify_rate_limited`, no personal data) |

## 3. Shared field rules (Zod, `features/*/schemas.ts`)

| Field | Rule | Field error codes |
|---|---|---|
| `termId`, `courseId`, `topicId`, `placementId`, `importId`, `userId` (roster overview) (hidden fields) | any value; missing, empty, over 64 chars, malformed, unknown, or other-college → the action answers `not_found` (never a field error) — same rule as 001's `divisionId` on the divisions screen | none (`not_found`) |
| `startYear` | Western or Arabic-Indic digits, trimmed, integer 2000–2100 | `required`, `invalid_format`, `out_of_range` |
| `kind` (term) | `first` \| `second` \| `summer` | `invalid_choice` |
| `startsOn`, `endsOn` | `YYYY-MM-DD`, a real calendar date (`<input type="date">`) | `required`, `invalid_format`; `endsOn` ≤ `startsOn` → `endsOn: date_order` |
| `courseCode` | `normalizeCourseCode` then data-model.md §3.2 rule | `required`, `too_long`, `invalid_format` |
| `nameAr` / `nameEn` (course) | 1–120 chars | `required`, `too_long` |
| `creditHours` | Western or Arabic-Indic digits, integer 0–12 | `required`, `invalid_format`, `out_of_range` |
| `description` | trimmed, 0–4000 chars, line breaks kept | `too_long` |
| `title` (topic) | 1–200 chars, single line (line breaks → space) | `required`, `too_long` |
| `direction` (topic move, hidden) | `up` \| `down`; anything else → `not_found` | none |
| `isActive` | `"true"` \| `"false"` | `invalid_choice` |
| `level` (placement) | integer 1–7, then ≤ college `levelsCount` | `required`, `out_of_range` |
| `termKind` (placement) | `first` \| `second` | `invalid_choice` |
| `divisionIds` (placement, repeated checkboxes) | 1–50 values, each a uuid | `required` (none checked), `invalid_choice` |
| `userId` (teacher select) | 1–64 chars | `required`, `invalid_choice` |
| `file` (roster) | a `File`; checks of contracts/roster-csv.md §1–2 | `required`, `file_*`, `missing_columns`, `duplicate_columns`, `too_many_rows` |
| `confirmedRemoval` (apply, optional) | absent, or Western/Arabic-Indic digits, integer 0–10,000; anything else is treated as absent | none (a wrong number → `conflict {reason: large_removal}`) |
| Query `q` | ≤ 100 chars, trimmed; longer/invalid → ignored | — |
| Query `status` (courses) | `active` \| `inactive`; invalid → ignored | — |
| Query `status` (roster) | one of `VERIFICATION_STATUSES`; invalid → ignored | — |
| Query `level` | integer 1–7; `division` uuid; `page` integer 1–10,000; `term` uuid — invalid → ignored | — |

## 4. Catalog actions — permission `catalog.manage`

### 4.1 `features/terms/actions.ts`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `createTermAction` (form) — FR-001 | `startYear`, `kind`, `startsOn`, `endsOn` | duplicate (year, kind) → `fieldErrors.kind = 'term_exists'` | `term.created` | `ok`; revalidate `/catalog/terms` |
| `updateTermAction` (form) — FR-002 | `termId` + the four fields | `not_found`; `term_exists`; no change → `ok`, no audit | `term.updated {fields}` | `ok`; revalidate |
| `setCurrentTermAction` (form) — FR-002 | `termId` | `not_found`; already current → `ok`, no audit | `term.made_current {previousTermId?}` | `ok`; `revalidatePath('/', 'layout')` |

### 4.2 `features/courses/actions.ts`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `createCourseAction` (form) — FR-004 | `courseCode`, `nameAr`, `nameEn`, `creditHours`, `description` | `code_taken` on `courseCode` | `course.created` | `redirect('/{locale}/catalog/courses/{id}')` |
| `updateCourseAction` (form) — FR-005 | `courseId` + the five fields | `not_found`; `code_taken`; no change → `ok`, no audit | `course.updated {fields}` | `ok`; revalidate the course and list |
| `setCourseActiveAction` (form) — FR-005 | `courseId`, `isActive` | `not_found`; unchanged → `ok`, no audit | `course.activated` / `course.deactivated` | `ok`; revalidate |
| `addTopicAction` (form) — FR-006 | `courseId`, `title` | `not_found`; 50 topics → `fieldErrors.title = 'too_many'`, `meta.max = 50` | `course.topic_added {topicId}` | `ok`; revalidate the course |
| `renameTopicAction` (form) | `courseId`, `topicId`, `title` | `not_found`; unchanged → `ok`, no audit | `course.topic_renamed {topicId}` | `ok` |
| `moveTopicAction` (form) | `courseId`, `topicId`, `direction` | `not_found`; at the edge → `ok`, no audit | `course.topic_moved {topicId, direction}` | `ok` |
| `removeTopicAction` (form) | `courseId`, `topicId` | `not_found` | `course.topic_removed {topicId}` | `ok` |

### 4.3 `features/course-plan/actions.ts`

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `addPlacementsAction` (form) — FR-008 | `courseId`, `level`, `termKind`, `divisionIds[]` | `level ≤ levelsCount` else `out_of_range`; repository `invalid_division` → `fieldErrors.divisionIds = 'invalid_choice'`; `not_found` | one `course.placement_added {level, termKind, divisionId}` per added placement | `ok({ added, existing })` — the form says "already exists" when `added = 0` |
| `removePlacementAction` (form) | `courseId`, `placementId` | `not_found` | `course.placement_removed {level, termKind, divisionId}` | `ok` |
| `assignTeacherAction` (form) — FR-010 | `courseId`, `termId`, `userId` | `not_found` (term/course); `course_inactive` → `conflict`; `invalid_teacher` → `fieldErrors.userId = 'invalid_choice'`; `too_many` → `fieldErrors.userId = 'too_many'`, `meta.max = 10`; already assigned → `ok`, no audit | `course.teacher_assigned {termId, userId}` | `ok`; revalidate the course |
| `removeTeacherAction` (form) | `courseId`, `termId`, `userId` | no such assignment → `not_found` | `course.teacher_removed {termId, userId}` | `ok` |

All catalog writes run in one `withTenant` transaction with their audit rows.

## 5. Roster actions — permission `roster.manage` (`features/roster/actions.ts`)

### 5.1 `uploadRosterAction` (form) — FR-014–FR-017, FR-021

1. Guard `roster.manage`. 2. Rate limit `roster-upload` (acting user).
3. Validate `file` presence, name, size (contracts/roster-csv.md §1) **before** reading its bytes.
4. Read bytes; check signatures; decode (`decodeCsvBytes`); parse records (`parseCsv`) — failures →
   `fieldErrors.file` with the matching code and `meta` (nothing stored).
5. Map the header (`mapRosterHeader`) → `missing_columns` / `duplicate_columns` with `meta.columns` as a
   comma-joined key list (§1); data records > 10,000 → `too_many_rows`.
6. Load the college's divisions (all) and `levelsCount` (from the session context).
7. `validateRosterRecords(records, header, { divisions, levelsCount })` → `{ rows, issues, issueCount,
   ignoredColumns }` (pure, `features/roster/rules.ts`).
8. In one `withTenant`: `roster.createDraft(tx, tenantId, { rowCount, rows, issues, issueCount,
   ignoredColumns, uploadedBy })` and audit `roster.import_uploaded {rows: rowCount, issues: issueCount}`.
9. `redirect('/{locale}/roster/imports/{id}')`.

The bytes, decoded text, and records live only in the action's memory. Logging: only
`roster.upload_failed` with `errorName`/`sqlState` on unexpected errors; never file contents or values.

### 5.2 Other roster actions

| Action | Fields | Rules | Audit | Result |
|---|---|---|---|---|
| `discardRosterImportAction` (form) — FR-019 | `importId` | `not_found`; `not_draft` / `expired` → `conflict {reason}` | `roster.import_discarded` | `redirect('/{locale}/roster')` |
| `applyRosterImportAction` (form) — FR-018 | `importId`, `confirmedRemoval?` | repository reasons → `not_found` or `conflict {reason: expired \| has_issues \| not_draft \| levels_changed}`; `large_removal` → `conflict {reason: 'large_removal', removed, current}` — the report then shows the second confirmation (routes.md §2), whose submit carries `confirmedRemoval = removed` | `roster.import_applied {added, changed, removed, linked, unlinked, synced}` | `revalidatePath('/', 'layout')`; `redirect('/{locale}/roster/imports/{id}?applied=1')` |
| `confirmVerificationAction` (form) — FR-026 | `userId` (hidden, any value; unknown → `not_found`) | `roster.confirmMatch`: `not_found`; `not_mismatch` → `conflict` | `profile.verified {method: 'manual'}` (target: the student's profile) | `ok`; revalidate `/roster` |
| `revokeVerificationAction` (form) — FR-026 | `userId` | `roster.revokeVerification`: `not_found`; `not_verified` → `conflict` | `profile.verification_revoked {method}` | `ok`; `revalidatePath('/', 'layout')` |

## 6. Changed feature-001 actions

| Action (001 contract) | Change | Batch |
|---|---|---|
| **All Server Actions** (framework setting) | The body size limit grows from 1 MB to 3 MB (`next.config.ts`), also for the public actions, so a 2 MB list reaches the validation; cost weighed in research.md §15 | PR-17 |
| `updateTenantSettingsAction` (§5.4) — FR-009 | The `levels_in_use` minimum is `max(studentProfiles.maxLevelInUse(tx), catalog.maxLevelInUse(tx))`. | PR-8 |
| `updateStudentProfileAction` (§5.1) — FR-024 | Repository `verified_locked` → `fail('profile_locked')`; nothing changes, no audit. Resubmitting the stored values is not refused (data-model.md §2). | PR-13 |
| `adminUpdateStudentProfileAction` (§5.3) — FR-024 | `verified_locked` → `fail('profile_locked')` (shown in the existing dialog's error summary). | PR-13 |
| `completeStudentProfileAction` (§5.1) — FR-022 | After `studentProfiles.create` succeeds, in the same transaction: `roster.verifyProfile(tx, tenantId, userId, ctx.user.name)`; on `verified` audit `profile.verified {method: 'auto'}` (actor: the student). The redirect is unchanged; the home screen then shows the verified state. | PR-20 |
| `updateAccountAction` (§5.1) — FR-022 | For a student who is not verified, after the name is saved: consume `profile-verify` (§2); if allowed, `withTenant` → `roster.verifyProfile(tx, tenantId, userId, newName)`; on `verified` audit `profile.verified {method: 'auto'}`. A verified student's rename does not call it (FR-028). A failure or an exhausted limit is logged (`roster.verify_after_rename_failed` with the error name / `roster.verify_rate_limited`) and does not fail the action (the name is saved; the next import re-checks). | PR-20 |
| `adminUpdateStudentProfileAction` (§5.3) — FR-022 | After creating or updating an unverified profile: `roster.verifyProfile` with the student's account name; on `verified` audit `profile.verified {method: 'auto'}` (actor: the administrator). | PR-20 |

## 7. Logging events added

`roster.upload_failed`, `roster.apply_failed`, `roster.verify_after_rename_failed`, `roster.verify_rate_limited`,
`catalog.action_failed`
(with `action` = the action name) — each with `errorName` and, where relevant, `sqlState`; never codes,
names, titles, descriptions, or file contents.

## 8. Test obligations (in addition to 001 §6)

- Every catalog and roster action: one e2e success case, each visible failure (validation, forbidden role
  — a faculty member and a student through `submitAs`, cross-college id → `not_found` with no change), and
  the audit row.
- `uploadRosterAction`: every whole-file code end to end; row problems via the report; rate limit at the
  31st upload in an hour (unit test of the policy; e2e not required).
- `applyRosterImportAction`: `large_removal` without and with the right `confirmedRemoval`, and with a
  forged wrong number; `levels_changed` after the administrator reduces the number of levels.
- `revokeVerificationAction`: an `auto` and a `manual` link; the revoked account is not re-linked by a
  rename or by the next import.
- Changed 001 actions: their existing e2e specs keep passing; new cases for `profile_locked` (student form
  and admin dialog, including a forged submission with the lock bypassed in the DOM) and automatic
  verification at onboarding and on rename; the sixth rename in a day is saved without verification (unit
  test of the action with the policy).

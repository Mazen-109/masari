# Quickstart & Validation Guide: Academic Catalog & Student Roster

**Feature**: `002-academic-catalog` · Setup: `specs/001-platform-foundation/quickstart.md` §1–3 (unchanged) ·
Contracts: [routes](./contracts/routes.md), [server actions](./contracts/server-actions.md),
[roster CSV](./contracts/roster-csv.md), [module reads](./contracts/catalog-read.md)

Follow 001's quickstart to get the app running with the demo college (`pnpm db:migrate`, `pnpm db:seed`,
`pnpm dev`). Steps become available as PR batches merge (noted in brackets). Each scenario is also covered
by the end-to-end spec named next to it; this guide is the manual check (constitution II) and the demo
script.

## Accounts you need

- The demo administrator (001 quickstart: accept the invitation printed by `pnpm db:seed`). The
  administrator is also a catalog manager.
- From the People/Invitations screens: invite one **Student Affairs** account and two **faculty** accounts.
- Two students who completed their profile: A (level 1, `GEN`) and B (level 2, `CS`), each with an account
  name of **three words** that you will reuse in the roster file.

## V1 — Terms and courses (US1) [PR-3, PR-5, PR-6] · `e2e/catalog-terms.spec.ts`, `e2e/catalog-courses.spec.ts`

1. As Student Affairs open **الشئون الأكاديمية → الفصول الدراسية**. Add `2026` / first term / 2026-09-19 →
   2027-01-15, and `2026` / second term. Add `2026` first term again → "this term already exists".
2. Make the first term current → it carries the «الحالي» badge; make the second current → the badge moves.
   Set the first term current again.
3. **المقررات → إضافة مقرر**: code `cs  211`, names «هياكل البيانات» / "Data Structures", 3 hours, a
   description → the course screen opens with code `CS 211`. Another course with code `cs 211` → refused.
4. Add topics «المصفوفات», «القوائم المترابطة», «الأشجار»; rename the second; move the third up; remove the
   first → two topics in the new order.
5. Deactivate the course → "inactive" in the list; reactivate it.
6. Sign in as a student and as a faculty member and open `/ar/catalog/courses` → 404 for both; no "Academic
   affairs" section in their navigation.

## V2 — Study plan and teachers (US2) [PR-8, PR-9] · `e2e/catalog-plan.spec.ts`

1. On `CS 211`: add a placement level 2, first term, divisions `CS` and `IS` → two rows. Repeat → "already
   exists".
2. Filter the course list by level 2 and division `CS` → `CS 211` is listed; level 3 → not listed.
3. As administrator, try to set the number of levels below 2 (Settings) → refused with the minimum.
4. Teachers section (current term): assign both faculty accounts → both listed; switch the term select to
   the second term → none. Remove one teacher.

## V3 — My courses (US3) [PR-11] · `e2e/my-courses.spec.ts`

1. As student B (level 2, `CS`) open **مقرراتي** → `CS 211` with its teacher and total hours 3. Open it →
   description and topics in order.
2. As student A (level 1, `GEN`) → the demo level-1 courses (seeded, PR-22) or the empty-state text.
3. Make the second term current (as Student Affairs) → student B's list is empty with the "nothing placed for
   this term" text; `/ar/courses/<CS 211 id>` → 404. Restore the first term.
4. Switch to English → same lists, names in English, layout LTR.

## V4 — Official student list import (US4) [PR-17, PR-18] · `e2e/roster-import.spec.ts`

Prepare `roster.csv` (UTF-8) in a spreadsheet or editor:

```csv
كود الطالب,الاسم,الفرقة,الشعبة,الرقم القومي
<code of A>,<A's three-word name as registered, plus a fourth word>,الأولى,GEN,00000000000000
<code of B>,<a different name>,2,CS,00000000000000
T-0003,طالب تجريبي ثالث,الفرقة الثانية,علوم الحاسب,00000000000000
```

1. Upload it → report: 3 rows, 0 problems, "ignored columns: الرقم القومي", preview "3 new". Nothing about the
   national-ID column is stored (check `roster_imports.summary` and `staged_rows` in `psql`: only the four
   values per row).
2. Save the same content as Windows-1256 (`iconv -f UTF-8 -t CP1256 roster.csv > roster-1256.csv`) and upload
   → the same report (the earlier draft is replaced).
3. Upload a broken file (empty code, `2.02312E+10`, level `9`, division `XX`, a duplicated code) → every
   problem listed with its row; no Apply button. Upload an `.xlsx` and a UTF-16 file → the form explains.
4. Re-upload the valid file and **Apply** (confirm the dialog) → history shows the import with its counts.
5. Upload a file with only the `T-0003` row and Apply → the report asks for the second confirmation
   ("2 of 3 students will be removed"); go back without confirming. Upload the valid file again.
6. Upload a file containing a level-3 row, set the number of levels to 2 in Settings, then Apply → refused:
   the number of levels changed, upload again. Restore the setting.

## V5 — Verification and lock (US5) [PR-19, PR-20, PR-21] · `e2e/roster-verification.spec.ts`

1. Overview: A = verified (automatic), B = name mismatch, `T-0003` = not registered. A's profile now shows
   «تم التحقق» and the official record; level/division are read-only. A forged update (remove `disabled` in
   the browser tools and submit a different level) → refused; saving the profile unchanged is accepted.
2. As administrator, open People → A → correct academic data: the dialog looks as in 001; saving a different
   level or code is refused with the explanation that the data comes from the official list.
3. As B, open the profile → "not verified yet" and the general advice about writing three names, without any
   hint about the official name.
4. As Student Affairs, **confirm** B in the overview (the dialog shows both names) → verified (manual);
   **revoke** it → name mismatch again, with the "verification revoked" note.
5. As B, change the account name to the listed one → B stays unverified (the revoked account is not
   re-linked automatically); confirm B by hand again → verified.
6. Register student C with code `T-0003` and the listed first three names → verified immediately after
   completing the profile, with the official level 2 / CS even if C picked other values.
7. **Revoke** A (an automatic verification) → A is unverified and editable; as administrator correct A's
   student code; apply the same list again → A's old code is "not registered", A is "not in list".
8. Apply a list without C → the preview announced "1 verified student will lose verification"; C is
   unverified and can edit level and division again.

## Checks

```bash
pnpm check        # format, lint, types, i18n/RTL, unit + integration (new *.int.test.ts files)
pnpm build
pnpm test:e2e     # includes the new specs, axe on the eight new screens, script budgets
```

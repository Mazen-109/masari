# Feature Specification: Academic Catalog & Student Roster

**Feature Branch**: `002-academic-catalog` (delivered as one branch + pull request per PR batch, see `tasks.md`)

**Created**: 2026-11-19

**Status**: Draft — waiting for the owner's answers (assumptions marked "owner to confirm" in Clarifications,
and the principle VI exception in plan.md Complexity Tracking); no batch starts before they are answered

**Input**: User description: "Feature 002 of the roadmap — the shared academic data the modules read: terms;
courses with Arabic and English names, a description, and an ordered list of topics; assignment of courses to
level + division; assignment of faculty members to courses; 'my courses' for a student from level + division;
and a roster CSV import with a validation report and a verified/unverified flag that locks verified academic
data. Everything the roadmap lists as *Later* stays out." (`docs/roadmap.md` §2 "002"; product spec §4.1:
Mu'eed "holds the course catalog and course descriptions, which feed Mizan and Kitabi"; §6: "Kitabi takes the
student's courses from the shared profile".)

## Overview

Every Masari module needs to know which courses a college teaches, who teaches them, and which courses each
student takes: Kitabi shows each student the books of their courses, CodeJudge attaches assignments to a
course and its teachers, the timetable generator schedules a term's courses for each level and division, and
the regulations assistant and Mizan use course descriptions and topics. This feature gives the college one
place to enter that academic data, shows each student their own courses, and lets Student Affairs load the
college's official student list so that self-declared student data (feature 001) can be checked against it
and, once verified, can no longer be changed by the student.

No module behaviour is delivered here. The feature ends with a documented, tested way for modules to read the
catalog and the academic part of the shared student profile.

**Terms used in this spec** (in addition to those of feature 001: college, level «الفرقة», division
«الشعبة», student code «كود الطالب», academic profile)

| Term | Arabic (UI) | Meaning |
|---|---|---|
| Academic year | العام الجامعي | A college year written as `2026/2027`. |
| Term | الفصل الدراسي | A part of an academic year: first term, second term, or summer term. |
| Current term | الفصل الدراسي الحالي | The one term the college marks as running now; "my courses" are computed for it. |
| Course | المقرر | A subject in the college's study plan, with a code, names, credit hours, description, and topics. |
| Course code | كود المقرر | The college's identifier for a course, e.g. `CS 211` or `حاسب 211`. |
| Credit hours | الساعات المعتمدة | The course's weight in the study plan (0–12). |
| Topics | موضوعات المقرر | The course's ordered list of topics or learning outcomes. |
| Study-plan placement | توزيع المقرر | "This course is taught to level L of division D in the first (or second) term of the year." |
| Teacher | القائم بالتدريس | A faculty member assigned to teach a course in a given term. |
| Catalog manager | — | A Student Affairs employee or an administrator (both may manage the catalog and the roster). |
| Official student list (roster) | قائمة الطلاب الرسمية | The college's list of enrolled students (student code, name, level, division) loaded from a CSV file. |
| Verified | تم التحقق | A student whose academic profile is matched to an entry of the official list. |

## Clarifications

### Session 2026-11-19

The owner was not available for live clarification. Each open question below was answered by the architect
with the most reasonable option and is recorded as an assumption; the answers are already applied to the
requirements. Each is **(assumed, owner to confirm)**. Changing one later means amending this spec.

- Q: Which roles manage the catalog (terms, courses, placements, teachers) and the official student list? →
  A: Student Affairs **and** college administration, with the same rights; faculty members and students only
  read what concerns them. **(assumed, owner to confirm)**
- Q: How is a course assigned to level + division — once in the study plan, or again every term? → A: Once,
  in the study plan: a placement says "level L, division D, first or second term of the year". "My courses"
  and the courses running in a term are derived from the placements whose term kind matches the current term;
  the summer term has no study-plan courses in this feature. Teachers, in contrast, are assigned per term.
  **(assumed, owner to confirm)**
- Q: Does an import add to the official list or replace it? → A: It **replaces** it: the uploaded file is the
  complete current list. Students missing from the new file are removed from the list and lose their
  verification. Because this is drastic, every import is shown as a preview (added, changed, removed, and
  verified students who would lose verification) and is applied only after confirmation; an import that
  would remove more than a fifth of the current list needs a second, explicit confirmation. **(assumed, owner
  to confirm)**
- Q: When does a student's name "match" the official name? → A: After ignoring diacritics, letter-form
  variants (أ/إ/آ/ا, ة/ه, ى/ي), extra and invisible spaces, and the space inside compound names such as
  «عبد الله», the account name starts with the first three words of the official name (all of them when the
  official name has only two). An account name with fewer words than that never matches automatically, so a
  student cannot be verified by guessing only a first and a father's name. A student whose code is found but
  whose name does not match is not verified; a catalog manager reviews and may confirm the match by hand.
  **(assumed, owner to confirm)**
- Q: May a verified student still change their level and division, and may the administration correct a
  verified student's academic data? → A: No to both. A verified student's student code, level, and division
  come only from the official list; the fix for wrong official data is a corrected import. A catalog
  manager can revoke a wrong verification (for example a student verified with someone else's code), after
  which the data can be corrected. Decided with reasons in `research.md` §2 (the roadmap left it to the
  plan). **(assumed, owner to confirm)**
- Q: Are student codes compared with or without regard to letter case? → A: As in feature 001: exactly as
  written (the college's codes are expected to be digits, sometimes with a hyphen). Digits written in Arabic
  script and invisible formatting characters copied from other programs are ignored. **(assumed, owner to
  confirm)**
- Q: Do faculty members get a "my teaching courses" screen in this feature? → A: No. Teacher assignments are
  stored and readable by modules; the first screen that uses them is CodeJudge (feature 005). **(assumed,
  owner to confirm)**
- Q: Is the catalog switched off when the college disables the Mu'eed module? → A: No. The catalog and the
  official list are shared core data (roadmap R2) that Kitabi, CodeJudge, and the timetable need; they work
  whatever modules are enabled. **(assumed, owner to confirm)**
- Q: Are course descriptions and topics bilingual like course names? → A: No. Names are entered in Arabic
  and English (they appear in lists in both languages); the description and topics are entered once, in the
  language of the college's regulation, and displayed in their own text direction. **(assumed, owner to
  confirm)**
- Q: Which columns does the official list contain? → A: Exactly four: student code, full name, level, and
  division. Any other column (e.g. national ID, phone) is ignored, never stored, and reported as ignored.
  **(assumed, owner to confirm)**
- Q: How long is uploaded personal data kept? → A: The uploaded file itself is never stored. The contents of
  an import that has not been applied are deleted when it is applied, discarded, or replaced; after 24 hours
  it can no longer be applied and its contents are deleted the next time one of the college's roster screens
  is opened or a catalog manager uploads, applies, or discards an import (a scheduled clean-up arrives with
  the background jobs of feature 003). Official-list
  entries are kept while they are in the current list and deleted when a later import no longer contains
  them. **(assumed, owner to confirm)**
- Q: How large may an import be, and must it run in the background? → A: Up to 10,000 students and 2 MB per
  file, processed while the catalog manager waits (a few seconds). Background processing arrives with the job
  runner of feature 003; see the plan's Complexity Tracking for this exception to constitution principle VI,
  which the owner accepts or rejects **before this documentation is merged**. **(assumed, owner to
  confirm)**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A catalog manager sets up terms and courses (Priority: P1)

A Student Affairs employee (or an administrator) creates the terms of the academic year, marks the running one
as current, and enters the college's courses: code, Arabic and English names, credit hours, a description,
and an ordered list of topics. Courses that are no longer taught are deactivated, never deleted.

**Why this priority**: every other part of this feature and every module that follows (Kitabi, CodeJudge,
the timetable, the regulations assistant, Mizan) depends on the course catalog.

**Independent Test**: as a Student Affairs employee, create two terms, make one current, create a course
with three topics, reorder and rename a topic, deactivate and reactivate the course; verify the list,
search, and filters show the expected courses, and that a student or faculty member cannot open any of
these screens.

**Acceptance Scenarios**:

1. **Given** the terms screen, **When** a catalog manager adds a term with academic year 2026/2027, kind
   "first term", and a start date before its end date, **Then** the term appears in the list, newest year
   first.
2. **Given** a term that already exists for the same academic year and kind, **When** a catalog manager adds
   it again, **Then** it is refused with a message that this term already exists.
3. **Given** two terms, **When** a catalog manager makes the second one current, **Then** it is shown as the
   current term and the first one is not current any more.
4. **Given** the new-course screen, **When** a catalog manager enters code `cs  211`, both names, 3 credit
   hours, and a description, **Then** the course is saved with the code `CS 211` and shown in the course
   list.
5. **Given** an existing course `CS 211`, **When** another course is saved with code `cs 211` or `CS 211`,
   **Then** it is refused with a message that the code is already used in the college.
6. **Given** a course, **When** the catalog manager adds three topics, renames the second, moves the third up,
   and removes the first, **Then** the course shows the remaining topics in the new order.
7. **Given** a course, **When** the catalog manager deactivates it, **Then** it is shown as inactive, students
   no longer see it, and it can be reactivated; there is no way to delete it.
8. **Given** the course list with more than 20 courses, **When** the catalog manager searches by part of a
   code or name, or filters by level, division, or status, **Then** only matching courses are listed, 20 per
   page.
9. **Given** a student or a faculty member, **When** they open any catalog screen or trigger any catalog
   action, **Then** the screen is reported as not found and the action is refused.

---

### User Story 2 - A catalog manager places courses in the study plan and assigns teachers (Priority: P1)

On a course's screen, the catalog manager states which level and divisions take the course and in which
term of the year (first or second), and which faculty members teach it in a chosen term.

**Why this priority**: placements are what turns the catalog into "the courses of a student"; teacher
assignments are what CodeJudge and the timetable need. Without them the catalog is a list nobody uses.

**Independent Test**: place a course in level 2 for two divisions in the first term, assign two faculty
members for the current term, remove one placement and one teacher; verify the course screen and the course
list filters reflect each change.

**Acceptance Scenarios**:

1. **Given** a course, **When** the catalog manager adds a placement for level 2, first term, and selects
   divisions CS and IS, **Then** two placements are shown (level 2 · CS · first term; level 2 · IS · first
   term).
2. **Given** a placement that already exists, **When** the same level, division, and term kind are added
   again, **Then** nothing is duplicated and the screen says the placement already exists.
3. **Given** a college with 4 levels, **When** a placement for level 5 is submitted, **Then** it is refused.
4. **Given** placements at level 4, **When** an administrator tries to reduce the college's number of levels
   to 3, **Then** the change is refused with an explanation (as for levels held by students in feature 001).
5. **Given** a course and the current term, **When** the catalog manager assigns two faculty members of the
   college, **Then** both are listed as teachers of the course for that term, and the other terms show no
   teachers.
6. **Given** the teacher selection, **When** the catalog manager looks at the choices, **Then** only active
   faculty members of their own college are offered; a forged choice of a student, a suspended user, or a
   user of another college is refused.
7. **Given** a teacher assignment or a placement, **When** the catalog manager removes it, **Then** it
   disappears from the course screen.

---

### User Story 3 - A student sees their courses (Priority: P1)

A student opens "My courses" and sees the courses of the current term for their level and division, each
with its code, name, credit hours, and teachers, and the total credit hours. Opening a course shows its
description and topics.

**Why this priority**: it is the first thing the catalog gives students, and it is exactly the data Kitabi
needs to show each student their books.

**Independent Test**: with a current first term and courses placed at level 2 / CS, a level 2 / CS student
sees exactly those courses; a level 2 / IS student sees the IS ones; changing the current term to the second
term changes both lists.

**Acceptance Scenarios**:

1. **Given** a current first term and active courses placed at (level 2, CS, first term), **When** a student
   of level 2 / CS opens "My courses", **Then** exactly those courses are listed by code with name, credit
   hours, and teachers of the current term, followed by the total credit hours.
2. **Given** the same college, **When** a student of level 2 / IS or of level 3 / CS opens "My courses",
   **Then** they do not see the level 2 / CS courses (unless those courses are also placed for them).
3. **Given** an inactive course placed for the student, **When** the student opens "My courses", **Then** it
   is not listed.
4. **Given** no current term, or a current summer term, or no course placed for the student, **When** the
   student opens "My courses", **Then** they see an explanation of why the list is empty and no error.
5. **Given** a course in the student's list, **When** they open it, **Then** they see its name, code, credit
   hours, teachers, description, and topics in order; **Given** a course not in their list, **When** they open
   its address, **Then** it is reported as not found.
6. **Given** a faculty member, Student Affairs employee, or administrator, **When** they open "My courses",
   **Then** it is reported as not found and no such entry appears in their navigation.

---

### User Story 4 - Student Affairs loads the official student list (Priority: P2)

A catalog manager downloads the template, fills it (or exports it from the college's system or Excel),
uploads it, reads the validation report, and applies the import once the file has no errors. The report
names every problem by row and column, in Arabic, so the file can be fixed in Excel and uploaded again.

**Why this priority**: verification is what makes self-declared student data trustworthy for paid content
(Kitabi watermarks) and grading, but the catalog and "my courses" already work without it.

**Independent Test**: upload a file saved by Excel as "CSV UTF-8" and the same file saved as plain "CSV" on
Arabic Windows; both produce the same preview. Upload a file with one error of each kind and verify every
error is reported with its row number. Apply a clean file and verify the list and the import history.

**Acceptance Scenarios**:

1. **Given** the roster screen, **When** a catalog manager uploads a valid file with Arabic headers in UTF-8
   (with or without the byte-order mark) or saved from Excel on Arabic Windows, **Then** the report shows
   the number of rows, no errors, and the preview counts (new, changed, unchanged, removed).
2. **Given** a file with a missing student code, a code that Excel turned into scientific notation, a level
   outside the college's levels, an unknown division, and the same code on two rows, **When** it is
   uploaded, **Then** the report lists each problem with its row number and column, and the import cannot
   be applied.
3. **Given** a file without the "division" column, an empty file, a file over 2 MB, more than 10,000 rows, an
   Excel workbook (`.xlsx`) or a UTF-16 text file, **When** it is uploaded, **Then** nothing is stored and the
   form says what is wrong (and, for a workbook, to save it as CSV).
4. **Given** a file with extra columns such as national ID, **When** it is uploaded, **Then** the report says
   which columns were ignored, and the ignored values are not stored anywhere.
5. **Given** an error-free preview, **When** the catalog manager confirms "Apply", **Then** the official list
   equals the file, the import appears in the history with its counts, and students are re-verified (US5).
6. **Given** an applied list, **When** a new file without some of the listed students is applied, **Then**
   those students are removed from the list; the preview announced how many verified students would lose
   their verification before confirmation.
7. **Given** an import that was not applied, **When** the catalog manager discards it or uploads another
   file, **Then** it can no longer be applied and its contents are deleted; **When** instead 24 hours pass,
   **Then** it can no longer be applied and its contents are deleted the next time a roster screen is
   opened or an import is uploaded, applied, or discarded.
8. **Given** two catalog managers, **When** both press "Apply" on the same import at the same moment,
   **Then** it is applied exactly once.

---

### User Story 5 - Students are verified and verified data is locked (Priority: P2)

Once the official list is loaded, every registered student whose code and name match it is verified
automatically — immediately, or when they complete their profile later. A verified student's level and
division follow the official list and can no longer be edited by the student; the student sees that their
data is verified and what the official list holds about them. Catalog managers see every student's status
and resolve name mismatches by hand.

**Why this priority**: it delivers the roadmap's "verify self-registered students against the roster,
locking verified academic data", which Kitabi and CodeJudge rely on before a real pilot.

**Independent Test**: load a list containing students A (code + name match), B (code matches, name
different), and C (not registered); register D whose code is not in the list. Verify the statuses verified,
name mismatch, not registered, not in list; confirm B by hand; verify A cannot change level or division and
sees the official data; re-import without A and verify A is unlocked.

**Acceptance Scenarios**:

1. **Given** a registered student whose code is in the official list and whose name matches, **When** the
   list is applied, **Then** the student is verified and their level and division are set to the official
   ones.
2. **Given** a student who has not completed their profile and whose code and name are in the list, **When**
   they complete the profile (even with a different level or division), **Then** they are verified with the
   official level and division, and their home screen says their data is verified.
3. **Given** a verified student, **When** they open their profile, **Then** level and division are shown as
   read-only with the official name, level, and division and an explanation, and a forged update is refused.
4. **Given** a verified student, **When** an administrator tries to correct their student code, level, or
   division, **Then** the correction is refused with an explanation that the data comes from the official
   list.
5. **Given** a student whose code is in the list but whose name does not match, **When** a catalog manager
   reviews the student in the roster overview and confirms the match, **Then** the student is verified (by
   hand); revoking that verification returns them to "name mismatch".
6. **Given** a student with a name mismatch, **When** they correct their own name so that it matches,
   **Then** they become verified without action from Student Affairs.
7. **Given** a student who is not verified (code not in the list, or name mismatch), **When** they open their
   profile, **Then** they see that their data is not verified yet, without being told whether their code
   exists in the list or whose name it carries.
8. **Given** the roster overview, **When** a catalog manager filters by status (verified, name mismatch, not
   in list, not registered) or searches by code or official name, **Then** the matching students are listed
   20 per page.
9. **Given** a verified student who is absent from a newly applied list, **When** they next open their
   profile, **Then** they are no longer verified and can edit level and division again.
10. **Given** a student verified automatically with another student's code (an impostor whose account name
    starts with the owner's first three names), **When** a catalog manager revokes the verification, **Then**
    the account is unverified and unlocked, it is not verified automatically again for that code by a later
    import or name change (only a confirmation by hand can link it again), and the administration can
    correct its student code so that the real owner can register.

---

### Edge Cases

- **Excel and Arabic text**: files saved by Excel as "CSV" on Arabic Windows use the Windows Arabic encoding;
  files saved as "CSV UTF-8" start with a byte-order mark; files exported by other systems are UTF-8 without
  it. All three are read correctly. "Unicode text" (UTF-16, tab-separated) is refused with a message to save
  as "CSV UTF-8".
- **Excel and numbers**: long numeric student codes may be shown by Excel as `2.02312E+10` and saved that way;
  such a cell is reported as an error asking to format the column as text. Leading zeros removed by Excel
  cannot be detected; the template and the screen tell the user to format the code column as text.
- **Arabic-Indic digits** (`٠١٢٣٤٥٦٧٨٩`) in student codes, levels, course codes, and credit hours are accepted
  and stored as Western digits.
- **Level written in words**: «الأولى», «الفرقة الثانية», … «السابعة» are accepted as levels 1–7.
- **Division written as a name**: a division may be given by its code or by its Arabic or English name; a
  value matching two divisions is reported as ambiguous.
- **Separators**: comma, semicolon, or tab, detected from the header row; quoted fields may contain the
  separator, quotes, or line breaks.
- **Blank rows** are skipped; row numbers in the report are the line numbers a spreadsheet shows (header =
  row 1).
- **A deactivated division** in the official list is accepted (students of a closing division stay listed).
- **Code typed by an impostor**: the student who owns the code cannot use it (code taken, feature 001) and
  contacts the administration. If the impostor is not verified (the usual case: their account name does not
  start with the owner's first three official names), the administration corrects the impostor's code
  directly. If the impostor was verified automatically (they knew the owner's first three names), a catalog
  manager first revokes the verification (FR-026), which unlocks the account and stops automatic
  re-verification of it for that code; then the administration corrects the code **at once** — the block
  against re-verification lives on the official-list entry and is lost if an import removes that entry and
  a later one adds the code back, while a corrected code makes any link impossible. Automatic verification
  after a name change is limited to five attempts per day per student (FR-022), so names cannot be guessed
  in bulk.
- **Invisible characters and copied names**: invisible formatting characters (for example the right-to-left
  mark Excel and other programs insert) are removed from every cell, and Arabic letters in "presentation
  form" (common in names copied from PDF files) are treated as the ordinary letters.
- **Student moves to the next level**: the next import changes the official level; verified students follow
  automatically; unverified students keep their own level.
- **Course common to several divisions or levels**: one course may have any number of placements.
- **Year-long course** (e.g. a graduation project): placed in both the first and the second term.
- **Concurrent edits**: two managers making different terms current at the same moment end with exactly one
  current term; two topics added at once both get distinct positions.
- **Teacher who later leaves**: a suspended faculty member or one whose role changed stays in past
  assignments; they are no longer offered for new ones.
- **Names in two scripts**: a student registered with a Latin-script name and listed with an Arabic name is a
  name mismatch, resolved by hand.
- **Large list**: a 10,000-row file is validated and applied while the manager waits, without blocking other
  users.

## Requirements *(mandatory)*

### Functional Requirements

**Terms**

- **FR-001**: A catalog manager MUST be able to add a term with an academic year (the year it starts,
  2000–2100, shown as `2026/2027`), a kind (first, second, or summer term), a start date, and an end date
  after the start date. A college MUST NOT have two terms with the same academic year and kind.
- **FR-002**: A catalog manager MUST be able to edit a term and mark one term as the current term; a college
  has at most one current term at any time. Terms are never deleted.
- **FR-003**: The terms screen MUST list the college's terms, newest academic year first, showing the current
  one.

**Courses**

- **FR-004**: A catalog manager MUST be able to create a course with a code (2–20 characters: Arabic or Latin
  letters, digits, spaces, hyphen, dot; stored with surrounding spaces removed, inner spaces collapsed, Latin
  letters upper-cased, and Arabic-Indic digits converted to Western digits) unique within the college; an
  Arabic and an English name (1–120 characters each); credit hours (whole number 0–12); and an optional
  description (up to 4,000 characters).
- **FR-005**: A catalog manager MUST be able to edit every field of a course and deactivate or reactivate it.
  Courses are never deleted; an inactive course is not shown to students and is not reported to modules as
  running in a term.
- **FR-006**: A catalog manager MUST be able to maintain a course's ordered topics: add a topic (1–200
  characters) at the end, rename it, move it up or down, and remove it; at most 50 topics per course.
- **FR-007**: The course list MUST be searchable by part of the code or of either name, filterable by level,
  division, and status (active/inactive), and paginated 20 per page.

**Study-plan placements and teachers**

- **FR-008**: A catalog manager MUST be able to place a course for a level (1 to the college's number of
  levels), one or more of the college's active divisions, and a term kind (first or second) in one step, and
  to remove a placement. An existing placement is never duplicated.
- **FR-009**: The college's number of levels MUST NOT be reduced below the highest level used by a placement
  or by an entry of the official list (extends feature 001 FR-032).
- **FR-010**: A catalog manager MUST be able to assign active faculty members of the college to an active
  course for a chosen term (at most 10 per course and term) and to remove an assignment. The course screen
  MUST show the teachers of a chosen term, the current term by default.

**My courses**

- **FR-011**: A student MUST be able to see "My courses": the active courses placed for their level and
  division in the kind of the current term, ordered by code, each with its code, name in the current
  language, credit hours, and the names of its teachers in the current term, plus the total credit hours.
- **FR-012**: A student MUST be able to open a course of their list and see its name, code, credit hours,
  teachers, description, and topics in order. Any other course MUST be reported as not found.
- **FR-013**: When there is no current term, the current term is a summer term, or no course is placed for
  the student, "My courses" MUST show an explanation instead of a list.

**Official student list (roster) import**

- **FR-014**: A catalog manager MUST be able to upload the official student list as a CSV file of at most 2 MB
  and 10,000 data rows, with the columns student code, full name, level, and division, identified by Arabic
  or English headers in any order. Files encoded in UTF-8 with or without a
  byte-order mark and in the Windows Arabic encoding MUST be accepted; the separator may be a comma, a
  semicolon, or a tab. A downloadable template MUST be offered.
- **FR-015**: Whole-file problems — no file, empty file, too large, too many rows, a spreadsheet workbook or
  another non-text file, an unsupported encoding, missing required columns — MUST be reported on the form
  without storing anything.
- **FR-016**: Invisible formatting characters MUST be removed from every cell, and Arabic-Indic digits
  converted, before validation; student codes keep their letter case, as in feature 001. Every row MUST be
  validated (student code format as in feature 001 FR-025, name 2–100
  characters, level within the college's levels, division known to the college, no student code twice in the
  file, correct number of fields), and the validation report MUST list each problem with its row number,
  column, and a translated explanation; at most 500 problems are listed, followed by the count of the rest.
- **FR-017**: Before applying, the report MUST show a preview: number of rows, new entries, changed entries,
  unchanged entries, entries that will be removed, and verified students who will lose their verification;
  and the names of any ignored columns. An import with at least one row problem MUST NOT be applicable.
- **FR-018**: Applying an import MUST replace the official list with the file's rows as one all-or-nothing
  change, re-verify the college's students (FR-022), and be possible exactly once. Apply MUST be refused,
  with an explanation, when the college's number of levels has been reduced since the upload below a level
  in the file (upload again), and when it would remove more than a fifth of the current list without the
  catalog manager's second, explicit confirmation of the number removed.
- **FR-019**: A catalog manager MUST be able to discard an import that has not been applied. Uploading a new
  file MUST discard the previous unapplied import. An unapplied import MUST expire after 24 hours and can
  then no longer be applied.
- **FR-020**: The roster screen MUST show the history of applied imports (date and time, who applied it,
  number of rows, and the counts of FR-017).
- **FR-021**: Personal data from uploaded files MUST be limited and short-lived: the file itself is never
  stored; columns other than the four MUST be ignored and never stored; the contents of an unapplied import
  MUST be deleted when it is applied, discarded, or replaced, and — once expired — no later than the next
  time one of the college's roster screens is opened or a catalog manager uploads, applies, or discards an
  import; an official-list entry MUST be deleted
  when an applied import no longer contains it. Problems and contents of uploaded files MUST never be written
  to logs.

**Verification and locking**

- **FR-022**: A registered student MUST be verified automatically when their student code is in the official
  list and their account name matches the official name (rule in Clarifications), at each of these moments:
  an import is applied; the student completes their academic profile; the administration creates or corrects
  the profile of an unverified student; an unverified student changes their name. The check after a name
  change MUST run at most five times per student per day (later name changes are saved without it; the next
  import checks again). An account whose verification was revoked (FR-026) MUST NOT be verified
  automatically again for the same student code while that code's entry stays in the official list (an
  import that removes the entry also removes this block; the administration is expected to correct the
  revoked account's student code right after revoking).
- **FR-023**: When a student is verified, and whenever an applied import changes their official level or
  division, the student's level and division MUST be set to the official ones. Modules MUST read level and
  division only from the shared student profile.
- **FR-024**: A verified student MUST NOT be able to change their level or division, and the administration
  MUST NOT be able to change a verified student's student code, level, or division; both are told that the
  data comes from the official list. Only a change of value is refused: submitting the current values again
  is not.
- **FR-025**: A catalog manager MUST be able to see every student with one status — verified (automatically
  or by hand), name mismatch, not in the official list (registered but absent), not registered (listed but
  without an account profile) — with a note when a verification was revoked; search by student code or
  official name (ignoring the Arabic spelling variants of the name rule), filter by status, 20 per page.
- **FR-026**: A catalog manager MUST be able to confirm by hand a student with a name mismatch (after seeing
  the account name and the official name side by side), and to revoke any verification, automatic or by
  hand (after seeing both names); a revoked account becomes unverified and editable again.
- **FR-027**: A verified student MUST see on their profile and home screen that their academic data is
  verified, and on their profile the official record held about them (student code, official name, level,
  division). An unverified student MUST see only that their data is not verified yet, with the same neutral
  advice for everyone (write the account name as in the college's records, with at least the first three
  names), never whether their code is in the list or the name it carries.
- **FR-028**: A student who is absent from a newly applied list, or whose automatic match no longer holds
  after the official name changed, MUST lose the verification and the lock; a confirmation by hand is kept
  while the student's code stays in the list. A verified student who changes their account name stays
  verified (the automatic match is checked again only when the official name changes).
- **FR-029**: The privacy notice (feature 001 FR-011) MUST state that the college's official student list
  (student code, name, level, division) is used to verify students' academic data.

**Access, audit, and integration**

- **FR-030**: Permissions MUST be extended as follows, enforced on the server for every screen and action
  (feature 001 FR-014, FR-015 apply):

  | Capability | Student | Faculty member | Student Affairs | Administration |
  |---|---|---|---|---|
  | See "My courses" and their course details | ✓ | – | – | – |
  | Manage terms, courses, topics, placements, and teachers | – | – | ✓ | ✓ |
  | Manage the official student list and verification | – | – | ✓ | ✓ |

- **FR-031**: Navigation and the home screen MUST show "My courses" to students and an "Academic affairs"
  section (terms, courses, official student list) to catalog managers, independent of the college's module
  switches.
- **FR-032**: The audit log (feature 001 FR-044) MUST record term creation, change, and making current;
  course creation, change, activation, deactivation, and topic changes; placements added and removed; teacher
  assignments added and removed; imports uploaded, discarded, and applied (with counts); students verified
  automatically at profile completion or name change, confirmed by hand, and verifications revoked — with who,
  what, and when, and never names, student codes, or file contents.
- **FR-033**: Other modules MUST be able to read, through one documented interface and never by their own
  copies: the current term and any term; a course with its topics; a student's courses for a term; whether a
  student takes a course; the courses a faculty member teaches in a term and whether they teach a given
  course; a term's running courses with their level/division groups and teachers; and a student's
  verification status with the official name. Each returns empty results rather than failing when the
  college has not entered the data yet. Reads that only a later feature needs (for example the students of
  a course, group sizes, the official list for a not-yet-bought report, course data for the regulations
  assistant) are added to the same interface by that feature.
- **FR-034**: All new screens MUST meet feature 001's language, direction, accessibility, and responsiveness
  requirements (FR-036, FR-041, FR-042, FR-043); course codes, student codes, and academic years are shown in
  left-to-right isolation inside Arabic text; descriptions and topics are shown in their own direction.
- **FR-035**: All data introduced by this feature belongs to one college and MUST never be readable or
  changeable by a user of another college (feature 001 FR-017).

### Key Entities

- **Term**: an academic year (start year) and a kind (first, second, summer), with start and end dates and
  whether it is the college's current term.
- **Course**: a subject in the college's catalog — code, Arabic and English names, credit hours,
  description, active flag.
- **Course topic**: one item of a course's ordered list of topics or learning outcomes.
- **Study-plan placement**: a course taught to one level of one division in the first or second term of the
  year.
- **Teacher assignment**: a faculty member teaching a course in one term.
- **Official-list entry**: one student of the college's official list — student code, full name, level,
  division — and, when matched, the verified student's account with how and when the match was made.
- **Import**: one uploaded official list, from upload to applied/discarded/expired: who, when, row and
  problem counts, preview counts, and (until applied or discarded) its validated rows and problems.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A catalog manager enters a course with its names, credit hours, description, 10 topics, and
  placements for three divisions in under 6 minutes.
- **SC-002**: A 5,000-row official list saved by Excel in either supported encoding shows its validation
  report within 10 seconds of upload, and applying it completes within 10 seconds, on the pilot hosting.
- **SC-003**: In a test file containing one row problem of every kind named in FR-016, 100% of the problems
  are reported with the correct row number and column, and none is reported for the valid rows; each
  whole-file problem of FR-015 is reported on the form.
- **SC-004**: In automated isolation tests covering every new kind of college data, the number of successful
  cross-college reads or writes is zero.
- **SC-005**: In automated tests, "My courses" lists exactly the active courses placed for the student's level,
  division, and current term kind in 100% of the cases, and a student reaches it from the home screen in one
  step.
- **SC-006**: For every new permission, automated tests confirm that each permitted role succeeds and each
  other role is refused (100% of the new rows of the permission table covered).
- **SC-007**: Automated accessibility checks report zero serious or critical issues on every new screen in
  both languages, and every user story can be completed with the keyboard alone.
- **SC-008**: In the pilot, at least 90% of registered students whose code is in the official list are
  verified automatically (the rest are name mismatches resolved by hand); measured once after the first real
  import.

## Assumptions

- Builds on feature 001 as merged: colleges, the four roles, divisions, number of levels, the academic profile
  (student code, level, division), the audit log, the people screen, and the shared shell. Nothing of 001's
  behaviour changes except where FR-009, FR-022–FR-024, FR-027, and FR-029 say so, plus one technical
  change: the largest accepted form submission grows from 1 MB to 3 MB for every form, so that a 2 MB list
  reaches the validation (plan.md Complexity Tracking).
- The pilot college has up to about 5,000 students, 100 courses, and 300 faculty members; one official list
  per college (no per-division lists).
- The official list comes from the college's student information system or a spreadsheet maintained by
  Student Affairs; it contains no data beyond the four columns that Masari needs.
- Out of scope (roadmap "Later" and other features): per-student elective selection, carried-over courses,
  grades import, prerequisites, course sections and rooms (007), a faculty "my teaching courses" screen (005),
  exporting the roster, notifying students by email about verification, and any module behaviour.

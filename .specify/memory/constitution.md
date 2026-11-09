# Masari (مساري) Constitution

Masari is a single platform that accompanies the university student from the first day of
college until graduation and employment, while serving faculty members, Student Affairs, and
the college administration. This constitution sets the non-negotiable rules every feature,
plan, and line of code in the project must follow. The source of product intent is
`docs/masari-spec-en.pdf`.

## Core Principles

### I. Arabic-First Experience

- Every user-facing screen, message, notification, error, receipt, and AI output MUST be
  available in Arabic, and Arabic MUST be the default language.
- All layouts MUST be designed right-to-left (RTL) first and verified in RTL; left-to-right
  support is secondary.
- Content MUST reflect Egyptian college reality (regulations, year/division, Fawry, local
  terms) rather than a translation of a foreign tool. Colloquial Egyptian Arabic is allowed
  where the spec calls for it (audio summaries, student-facing feedback); formal Arabic is
  used for official content (regulations, receipts, announcements).
- Arabic text MUST never be rendered by an image-generation model. Generated images carry no
  text; Arabic text is overlaid in code.

**Rationale**: being "Arabic and Egyptian" is a core strength of the product, and Arabic text
inside generated images is a known failure point.

### II. Security and Integrity of Paid Content (NON-NEGOTIABLE)

- Access control MUST be role-based with four separate roles: Student, Faculty member,
  Student Affairs, and Administration. Every endpoint and screen MUST enforce the role on the
  server side; hiding a button is not access control.
- Every textbook access code MUST be assigned to exactly one student, exactly once, and only
  after a confirmed payment. Assignment MUST be atomic so that two concurrent purchases can
  never receive the same code, and a paid student can never receive zero codes.
- Codes MUST be bound to the student's account, MUST NOT be transferable, and MUST be stored
  protected (encrypted or otherwise unreadable at rest) and never logged in plain text.
- Every downloaded PDF MUST carry a watermark with the student's name and student code.
- Every payment transaction and every code assignment MUST be written to an append-only
  audit log, and every transaction MUST produce an electronic receipt.
- Secrets (API keys, payment credentials) MUST NOT be committed to the repository.
- The platform MUST be tested against common web vulnerabilities (e.g., the OWASP Top 10)
  before any delivery or demo to a real college.

**Rationale**: Kitabi handles money and paid content; one duplicated or leaked code damages
trust in the whole platform.

### III. One Shared Student Profile

- All modules MUST read from and write to one shared student profile (year, division,
  courses, grades, skills) as the single source of truth. A module MUST NOT keep its own copy
  of profile data that can drift.
- Data passed directly between modules MUST go through an explicit, documented contract.
  The defined paths are: Mu'eed → Mizan (course descriptions), CodeJudge → CareerMap (weak
  points), CareerMap → Tadreeb (required skills), and Kitabi reading the student's courses
  from the shared profile.
- Each module MUST remain independently usable and testable: if another module is missing or
  not yet built, it degrades gracefully instead of failing.
- College-specific content (regulations, course catalog, years, divisions, books) MUST be
  data, not code, so that another college can adopt Masari by changing data only.

**Rationale**: "integrated, not bundled" is what makes Masari more than a set of side-by-side
tools, and portability to other colleges is a stated goal.

### IV. Human Review for Consequential Decisions

- Plagiarism (similarity) results from CodeJudge are evidence for a faculty member to review;
  the system MUST NOT penalize a student automatically.
- Mizan exam analysis is advisory; the faculty member makes the final approval decision.
- AI-generated educational drawings and exam diagrams MUST pass a faculty review step before
  they are published to students.
- Early-warning alerts go to the academic advisor; they MUST NOT trigger automatic
  consequences for the student.
- Automatic grades from test cases MUST show the student which tests passed and failed, so
  every grade is explainable.

**Rationale**: decisions that affect a student's grades, record, or what students learn need
an accountable human, and automated signals can be wrong.

### V. Grounded and Practical AI

- The Mu'eed assistant MUST answer only from the official regulation documents (RAG), MUST
  cite the source section for each answer, and MUST say it does not know rather than invent
  an answer when the documents do not cover the question.
- Educational drawings MUST be generated as code (Mermaid or SVG) rather than raster images,
  so they can be reviewed and corrected.
- Video MUST be composed from images, audio, and subtitles (e.g., with FFmpeg) rather than
  generated end-to-end from text.
- Every AI feature MUST have a defined fallback when the model or provider is unavailable, and
  its cost per use MUST be considered in the plan.
- Student personal data sent to external AI providers MUST be the minimum needed for the task.

**Rationale**: these are the mitigations the spec already chose for scientific errors, cost,
and reliability; making them rules keeps every AI feature consistent.

### VI. Phased Scope and Simplicity

- Work MUST follow the spec's scope priorities, in order:
  1. Foundation: accounts, roles and permissions, and the shared database.
  2. Demo-critical modules: Mu'eed, CodeJudge, and Kitabi.
  3. Complementary modules: Mizan (light version: Bloom classification, table of
     specifications, report), CareerMap, and Tadreeb.
  4. AI layer: the three candidate features first (concept drawing, college posters,
     explain-in-a-minute video), then the rest if time allows.
- A later phase MUST NOT start while an earlier phase has blocking defects, unless the change
  is explicitly justified in the plan.
- The simplest design that meets the spec wins (YAGNI). New services, frameworks, or
  infrastructure MUST be justified in the plan's complexity tracking; the project is built by
  a single developer in about six months.

**Rationale**: six modules plus an AI layer is a heavy load for one developer; a working demo
of the strongest modules beats many half-finished ones.

### VII. Tested Critical Paths

- The following MUST have automated tests that pass before a feature is considered done:
  payment confirmation and code assignment (including concurrency), role permissions,
  timetable conflict-freedom, CodeJudge grading against test cases, and plagiarism detection
  with renamed variables.
- Every feature spec MUST include acceptance scenarios, and each scenario MUST be verifiable
  by a test or a documented manual check.
- Bugs found in a critical path MUST get a regression test with the fix.

**Rationale**: these are the paths where a silent failure costs money, fairness, or trust, and
they are what the demo depends on.

## Platform Constraints

- **Payments**: Kitabi MUST use the payment gateway's sandbox/test mode until the college has
  its own merchant account. Card, Fawry, and mobile wallet are the target payment methods.
  Switching to live payments is a deliberate configuration change, never a code default.
- **Privacy**: student data (grades, CVs, submissions, purchases) MUST be visible only to the
  roles that need it. The student MUST be able to see what the platform holds about them.
- **Design**: UI work SHOULD use the Impeccable design skill installed in the repository, and
  MUST meet basic accessibility (readable contrast, keyboard navigation, labelled form fields)
  in both RTL and on mobile screen widths.
- **Pilot data**: the platform MUST be runnable with one college's own data and without
  approvals from external bodies.
- **Open question**: whether textbooks are printed or PDF is still open. If printed, Kitabi
  adds pickup booking with a QR code; features MUST NOT assume one answer until it is settled.

## Development Workflow

- Every feature follows the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` (when
  needed) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Every plan MUST include a Constitution Check that confirms compliance with each principle
  above, or records a justified exception in its complexity tracking.
- Each feature is developed on its own branch and merged through a pull request. The project
  owner reviews and approves merges to `main`.
- Specs describe what and why in the user's language; technology choices belong in the plan.
- Commits are small and descriptive; `main` MUST stay in a runnable state.

## Governance

- This constitution takes precedence over other practices, templates, and plans in the
  repository. Where a plan or task conflicts with it, the constitution wins until it is
  amended.
- Amendments are made through `/speckit-constitution` in a pull request that states the
  change and its reason, and they take effect when the project owner approves the merge.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle,
  MINOR for adding a principle or section or materially expanding guidance, PATCH for
  clarifications and wording.
- Every pull request review MUST check compliance with this constitution. Any added
  complexity MUST be justified in the relevant plan.
- `CLAUDE.md` (when present) and the Spec Kit templates provide runtime development guidance and MUST stay
  consistent with this document.

**Version**: 1.0.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09

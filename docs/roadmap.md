# Masari Roadmap

**Status**: v1 · 2026-11-14 · Author: architect (Claude Fable 5.2) · Approver: owner
**Sources**: `docs/masari-spec-en.html` (product spec) · `.specify/memory/constitution.md` (rules)

This document breaks the whole product into ordered features. Each feature becomes one Spec Kit folder
`specs/NNN-short-name/` (spec → plan → tasks → analyze) and is then implemented as a sequence of PR
batches (one batch = one pull request; Opus 5.5 implements, Fable 5.2 reviews).

- **Feature numbers** below are the planned Spec Kit numbers. Only `001` exists today; later numbers are
  confirmed when each feature is specified.
- **MVP** = the release used for the pilot at the owner's college and for the graduation demo. It follows
  the product spec's scope priorities (§10): foundation → Mu'eed, CodeJudge, Kitabi → the rest.
- **MVP cut** = the smallest slice of that feature that is acceptable in the release it belongs to;
  everything listed under "later" is explicitly out of that slice.

## 1. Overview

| # | Feature | Module | Release | MVP? | Depends on |
|---|---|---|---|---|---|
| 001 | Platform foundation | Core | M0 | ✅ MVP | — |
| 002 | Academic catalog & student roster | Core (owned by Mu'eed) | M0 | ✅ MVP | 001 |
| 003 | Mu'eed — regulations assistant (RAG) + AI gateway | Mu'eed | M1 | ✅ MVP | 001, 002 |
| 004 | Kitabi — textbooks & access codes | Kitabi | M1 | ✅ MVP | 001, 002 |
| 005 | CodeJudge — assignments & automatic grading | CodeJudge | M1 | ✅ MVP | 001, 002 |
| 006 | CodeJudge — similarity (plagiarism) detection | CodeJudge | M1 | ✅ MVP | 005 |
| 007 | Mu'eed — timetable generator | Mu'eed | M2 | ✅ MVP | 002 |
| 008 | Mu'eed — Student Affairs dashboard | Mu'eed | M2 | ✅ MVP | 003, 007 |
| 009 | Pilot readiness: security testing, hardening, operations | Core | M2 | ✅ MVP (release gate) | 001–008 |
| 010 | Mizan — exam analysis (light version) | Mizan | M3 | — | 002, 003 |
| 011 | CareerMap — CV analysis & learning plan | CareerMap | M3 | — | 001, 003; optional 005 |
| 012 | Tadreeb — internships | Tadreeb | M3 | — | 011 |
| 013 | AI layer — concept drawings (candidate) | AI layer | M4 | — | 003 |
| 014 | AI layer — college & internship posters (candidate) | AI layer | M4 | — | 003; optional 012 |
| 015 | AI layer — explain-in-a-minute video (candidate) | AI layer | M4 | — | 003, 004 |
| 016 | AI layer — study planner | AI layer | M5 | — | 007 |
| 017 | AI layer — question bank from the book | AI layer | M5 | — | 004, 010 |
| 018 | AI layer — early warning for advisors | AI layer | M5 | — | 005 |
| 019 | AI layer — elective course advisor | AI layer | M5 | — | 002, 011 |
| 020 | AI layer — audio summaries | AI layer | M5 | — | 004, 015 |
| 021 | AI layer — revision infographics & exam diagrams | AI layer | M5 | — | 013, 010 |
| 022 | AI layer — welcome & course revision videos | AI layer | M5 | — | 015 |
| 023 | Multi-university operations & commercial packaging | Core | M6 | — | 009 |
| 024 | Kitabi — printed-book pickup with QR (conditional) | Kitabi | when needed | — | 004 |

Releases: **M0** foundation · **M1** demo core · **M2** MVP complete (pilot + graduation demo) ·
**M3** complementary modules · **M4** AI candidates · **M5** AI backlog · **M6** selling to other universities.

```text
001 ─► 002 ─┬─► 003 ─┬─► 008 ◄── 007 ◄── 002
            │        ├─► 010 ─► 017, 021
            │        ├─► 011 ─► 012 ─► 014
            │        └─► 013, 014, 015 ─► 020, 022
            ├─► 004 ─► 015, 017, 020, 024
            └─► 005 ─► 006, 018, (011)
001…008 ─► 009 ─► 023
```

## 2. Features

### 001 — Platform foundation · ✅ MVP

**Scope.** The base everything else stands on: the pnpm monorepo and Next.js application skeleton; CI with
all constitutional gates; PostgreSQL with tenant isolation (row-level security) and the tenant ("college")
entity; accounts with email + password, email verification, password recovery, and invitations; the four
roles (student, faculty member, Student Affairs, administration) with server-side permission checks; the
shared student profile (student code, year/level, division); college settings (divisions, number of
levels, allowed email domains, enabled modules); the Arabic-first RTL application shell with an English
switch, role-aware navigation, and placeholder entries for the six modules; the audit log; and the
operator command that onboards a new college.

**Depends on.** Nothing.

**MVP cut.** Everything above. *Later (other features)*: single sign-on with Microsoft/Google (023),
audit-log viewer and account export/deletion tools (009), dark theme, in-app notifications.

**Spec**: `specs/001-platform-foundation/`.

### 002 — Academic catalog & student roster · ✅ MVP

**Scope.** The shared academic data the modules read (product spec §4.1: Mu'eed "holds the course catalog
and course descriptions, which feed Mizan and Kitabi"): academic years and terms; courses (code, Arabic and
English names, level, division, credit hours, description, and an ordered list of topics/learning
outcomes); which courses run in which term and who teaches them; which courses each student takes (derived
from level + division, with per-student adjustments for electives and carried-over courses); and a roster
import (CSV) so Student Affairs can load the official student list and verify self-registered students
against it (student code + name), locking verified academic data.

**Depends on.** 001.

**MVP cut.** Terms; course CRUD with bilingual names, description, and topics; assignment of courses to
level + division; faculty-to-course assignment; "my courses" for a student from level + division; roster CSV
import with validation report and verified/unverified flag. *Later*: per-student elective selection,
carried-over courses, grades import, prerequisites.

**Decide in its plan.** CSV format and Arabic encoding handling; whether verified students may still edit
level/division.

### 003 — Mu'eed: regulations assistant (RAG) + AI gateway · ✅ MVP

**Scope.** Students ask questions about the college regulations in Arabic and get answers grounded in the
official documents, with citations to the article/page; when the documents do not contain the answer the
assistant says so and offers to forward the question to Student Affairs. Student Affairs uploads and
versions the regulation documents (PDF/DOCX), sees ingestion status, and can test answers before
publishing. This feature also introduces the shared AI infrastructure used by every later AI feature: the
server-side AI gateway (provider/model configuration, per-college usage metering and budget caps, prompt
and output logging without personal data, safety rules), Arabic-aware chunking and embeddings in
`pgvector`, S3-compatible object storage, and the PostgreSQL-backed background job runner (for ingestion).

**Depends on.** 001, 002 (course descriptions are an additional knowledge source).

**MVP cut.** One document set per college; text-based PDFs (scanned PDFs rejected with a clear message);
chat with citations, "not in the regulations" behaviour, thumbs up/down feedback, and escalation of
unanswered questions into a list for Student Affairs; evaluation set of ≥ 50 real questions with expected
sources, run in CI against a recorded fake and manually against the live model. *Later*: OCR for scanned
documents, multi-turn memory beyond the current conversation, voice input.

**Decide in its plan.** Embedding model for Arabic (multilingual, hosted vs self-hosted) and its cost;
retrieval strategy (hybrid keyword + vector for Arabic morphology); generation model tier; job-queue
library; object-storage provider for the pilot.

### 004 — Kitabi: textbooks & access codes · ✅ MVP

**Scope.** A student sees the books for their courses automatically (from level + division via the
catalog), pays online, and immediately receives the book and/or its access code in their account, with an
electronic receipt. Administration uploads books and a batch of codes once; the system assigns exactly one
code per paid student, never reuses a code, and binds it to the student's account. Downloaded PDFs carry a
visible and embedded watermark with the student's name and code. The administration dashboard shows who
bought, revenue, remaining codes, and students who have not bought yet (from the roster). Payment uses the
gateway's sandbox (card, Fawry reference code, mobile wallet) behind a payment-provider interface; every
payment event is recorded in an immutable transaction log.

**Depends on.** 001, 002.

**MVP cut.** Books linked to courses; code batch upload (encrypted at rest); checkout with one sandbox
gateway covering card + Fawry/kiosk reference + wallet; verified, idempotent payment webhook; exactly-once
code assignment under concurrency; receipt page and email; watermarked PDF download with signed,
expiring links; admin dashboard (purchases, revenue, remaining codes, not-yet-bought list, CSV export).
*Later*: refunds, discount/bundle pricing, real merchant account activation (needs the college's approval),
printed-book pickup (024).

**Decide in its plan.** Gateway choice (Paymob vs FawryPay — whichever sandbox covers all three payment
methods with the least integration risk); encryption-key management for codes; PDF watermarking library and
performance for large books. **Open question for the owner** (product spec §12): are the college's books
printed or PDF? Printed books add feature 024.

### 005 — CodeJudge: assignments & automatic grading · ✅ MVP

**Scope.** A faculty member creates a programming assignment for a course (statement, language, deadline,
visible and hidden test cases with weights, limits). Students submit code, which is compiled and run
against the test cases in an isolated sandbox with time/memory limits; they see per-test results, a score,
and feedback in Arabic explaining what failed and how to approach it (without giving the solution). Faculty
see all submissions, scores, and can override a grade with a note and export grades. Each student's recurring
weak points (e.g. off-by-one errors, complexity, edge cases) are recorded in the shared profile for
CareerMap.

**Depends on.** 001, 002 (courses, enrolment, faculty assignment); 003 for the AI gateway when Arabic
feedback is AI-generated.

**MVP cut.** Languages: Python and C++ (the two most taught); stdin/stdout test cases; best-submission
scoring with late policy = closed after deadline; rule-based Arabic feedback from test outcomes plus an
AI-written hint behind a per-assignment switch; grade override and CSV export; weak-point tags written to
the profile. *Later*: Java, interactive/special judges, partial-credit rubrics, in-browser editor
enhancements, contests.

**Decide in its plan.** Sandbox engine and hosting (a self-hosted open-source judge as a separate service
called over HTTP — it must stay out of the web app's process, and its licence must not contaminate the
app's code); queueing and back-pressure for deadline rushes; what "weak point" taxonomy is stored.

### 006 — CodeJudge: similarity (plagiarism) detection · ✅ MVP

**Scope.** For an assignment, the system compares all submissions structurally by parsing them into
abstract syntax trees, normalising identifiers, literals, formatting, and comment noise, so copying is
detected even when variable names are changed or statements are reordered superficially. Faculty get a
ranked list of suspicious pairs with a similarity score and a side-by-side highlighted view, can mark a pair
as confirmed/dismissed with a note, and can exclude instructor-provided starter code from the comparison.
Results are evidence for a human decision — the system never penalises automatically.

**Depends on.** 005.

**MVP cut.** Python and C++; pairwise comparison within one assignment; normalised-AST fingerprinting
(k-gram hashing/winnowing) with a threshold; side-by-side view; confirm/dismiss with note; starter-code
exclusion. *Later*: cross-term and cross-section comparison, clustering of groups, detection of
AI-generated code.

**Decide in its plan.** Parser (tree-sitter grammars) and fingerprint parameters; evaluation corpus with
known copied pairs and target precision/recall.

### 007 — Mu'eed: timetable generator · ✅ MVP

**Scope.** Student Affairs enters the term's inputs — course offerings and their sections, instructors and
their availability, rooms with capacity and type (lecture hall/lab), time slots, and student groups (level
+ division) — and the system generates a conflict-free timetable using constraint satisfaction: no
instructor, room, or student group is double-booked; room capacity and type fit; instructor availability is
respected. When no solution exists the system reports which constraints conflict. Student Affairs can pin
sessions, regenerate, edit manually with live conflict checking, and publish; students and faculty see their
own timetable.

**Depends on.** 002.

**MVP cut.** Hard constraints listed above; one term at a time; generation completes within 60 s for a
college-sized input (≈ 150 sessions/week) or reports infeasibility with the conflicting set; pin +
regenerate; manual edit with conflict check; publish; personal timetable view. *Later*: soft-constraint
optimisation (minimise gaps, preferred days), exam timetables, calendar (ICS) export.

**Decide in its plan.** Solver approach in TypeScript (backtracking with MRV/forward checking and
min-conflicts repair) vs an external solver service; running it as a background job.

### 008 — Mu'eed: Student Affairs dashboard · ✅ MVP

**Scope.** One place for Student Affairs: questions the assistant could not answer (to reply to and to
turn into approved FAQ entries the assistant then uses), the most frequent question topics, answer quality
from student feedback, regulation document status, and timetable status (draft/published, unresolved
conflicts). It closes the loop that reduces repeated questions each year.

**Depends on.** 003, 007.

**MVP cut.** Unanswered-question inbox with reply (student notified by email) and "save as FAQ"; top
topics for a date range; feedback ratio; links to document and timetable management. *Later*: charts over
terms, per-division breakdown, poster generation entry point (014).

### 009 — Pilot readiness: security testing, hardening, operations · ✅ MVP (release gate)

**Scope.** The work that must be true before real students use the platform (product spec §7: "tested
against common vulnerabilities before delivery"): an OWASP Top 10 / ASVS-level-1 review with a written
report and fixes; automated dynamic scanning in CI; nonce-based Content-Security-Policy; breached-password
check; audit-log viewer for administrators; account data export and deletion for privacy requests;
database backup and restore drill; error monitoring and uptime checks; a production Docker image with a
documented single-server deployment; load test for 500 concurrent students; and a pilot runbook (onboarding
a college, incident response, secret rotation).

**Depends on.** 001–008 (it audits what exists).

**MVP cut.** All of the above at a "pilot at one college" level. *Later (023)*: multi-region, per-tenant
backups, SLA monitoring.

### 010 — Mizan: exam analysis (light version)

**Scope.** A faculty member enters or uploads an exam before approval; each question is classified by
Bloom's taxonomy level and mapped to a course topic (from the catalog); the system builds the table of
specifications (topics × cognitive levels with marks), measures course coverage, flags imbalance (e.g. 80%
"remember", untested topics), and produces a printable Arabic report. The faculty member can correct any
classification; corrections are kept.

**Depends on.** 002 (course topics), 003 (AI gateway).

**MVP cut (the spec's "light version").** Question entry by paste/form (Arabic and English questions);
AI classification with confidence and manual override; table of specifications; coverage and balance
indicators; PDF/print report. *Later*: file upload with parsing of Word/PDF exams, question bank reuse,
difficulty estimation, comparison across years.

### 011 — CareerMap: CV analysis & learning plan

**Scope.** A student uploads a CV (or fills a structured profile), chooses target roles, and the system
extracts skills, compares them semantically with the skills demanded by job postings for those roles,
shows the gaps, and produces an ordered learning plan. Weak points recorded by CodeJudge feed the gap
analysis; the resulting required skills are published to the shared profile for Tadreeb.

**Depends on.** 001, 003 (AI gateway, embeddings); optional 005 (weak points).

**MVP cut.** CV upload (PDF/DOCX) with skill extraction the student can edit; a curated, admin-managed set
of target roles with required skills (seeded from real Egyptian postings, entered manually); gap view;
ordered plan with free learning resources; skills written to the shared profile. *Later*: live
job-posting ingestion, progress tracking, CV rewriting suggestions.

### 012 — Tadreeb: internships

**Scope.** Administration publishes internship opportunities (company, role, required skills, period,
seats). Students see opportunities ranked by semantic match with their skills (from CareerMap and the
profile), apply, and are tracked through the stages (applied → accepted → in progress → completed); at the
end a supervisor/administration evaluation is recorded on the student's profile.

**Depends on.** 011.

**MVP cut.** Opportunity CRUD; ranked list with match explanation; application and stage tracking;
final evaluation form; admin overview. *Later*: company accounts, document uploads, internship posters
(014).

### 013 — AI layer: concept drawings (candidate)

**Scope.** A student asks about a concept and receives an illustration or flowchart. To avoid scientific
errors and broken Arabic in generated images (product spec §11), the model generates diagram *code*
(Mermaid or constrained SVG) that is rendered by the platform with Arabic labels added in code; drawings
intended for a whole course go through a faculty review button before publishing.

**Depends on.** 003.

**MVP cut.** Mermaid flowcharts/sequence/mind-map diagrams with Arabic labels; sanitised rendering;
per-student history; faculty review queue for course-published drawings.

### 014 — AI layer: college & internship posters (candidate)

**Scope.** Student Affairs writes an announcement and gets a ready-to-publish poster; the same for
internship announcements. The image model generates only the background artwork; Arabic text is composed on
top in code using the college's branding, in standard sizes (story, square, A4).

**Depends on.** 003; optional 012 (internship data).

**MVP cut.** Three templates; text overlay with correct Arabic shaping; PNG export in three sizes.

### 015 — AI layer: explain-in-a-minute video (candidate)

**Scope.** Part of a lecture or book chapter becomes a short video made of generated slides, an Arabic
voice-over, and written subtitles, composed with FFmpeg in a background job rather than generated as raw
video.

**Depends on.** 003 (gateway, jobs, storage), 004 (book content rights and access).

**MVP cut.** Input: pasted text or a selected book section (≤ 1,500 words); output: 60–90 s MP4 with
subtitles; faculty review before course-wide publishing.

### 016–022 — AI layer backlog

Specified one at a time after the candidates, in this order unless the owner re-prioritises:

| # | Feature | One-line scope | Depends on |
|---|---|---|---|
| 016 | Study planner | Daily plan from timetable and exam dates; re-plans when the student falls behind | 007 |
| 017 | Question bank from the book | Review questions per chapter distributed across Bloom's levels | 004, 010 |
| 018 | Early warning | Alerts the academic advisor when grades drop or submissions stop | 005 |
| 019 | Elective advisor | Suggests electives from level, interests, and career goals | 002, 011 |
| 020 | Audio summaries | Each chapter as a short audio file in Egyptian Arabic | 004, 015 |
| 021 | Revision infographics & exam diagrams | One-page chapter summary; diagrams for exam questions on request | 013, 010 |
| 022 | Welcome & revision videos | Yearly first-year welcome video; pre-exam course revision video | 015 |

### 023 — Multi-university operations & commercial packaging

**Scope.** What is needed to sell and run Masari for other universities: an operator console (create and
suspend colleges, enable modules per contract, usage and AI-cost metering per college); a self-service
onboarding checklist for a new college (regulations, catalog, roster, branding); per-college branding and
custom domain; single sign-on with Microsoft 365 / Google Workspace; per-college data export and deletion;
an on-premises package (Docker Compose bundle with upgrade procedure); and licensing terms per module.

**Depends on.** 009.

**MVP cut (for the first external customer).** Operator console with module enablement and usage metering;
branding (logo, name, primary colour); SSO for one provider; on-premises bundle and upgrade guide.

### 024 — Kitabi: printed-book pickup with QR (conditional)

**Scope.** Only if the college's books are printed (open question in the product spec): after payment the
student books a pickup slot and receives a QR code; library staff scan it to hand over the book and mark it
collected; the dashboard shows collected vs pending.

**Depends on.** 004.

## 3. Cross-cutting capabilities and where they first appear

| Capability | Introduced in | Reused by |
|---|---|---|
| Tenant isolation, roles, audit log, i18n/RTL shell | 001 | all |
| Course catalog, enrolment, roster | 002 | 003–008, 010, 016–019 |
| AI gateway, embeddings (`pgvector`), object storage, background jobs | 003 | 005, 010–022 |
| Payment-provider interface, transaction log | 004 | 024 |
| Sandbox execution service | 005 | 006 |
| Transactional email | 001 | 004, 008 |
| Media pipeline (FFmpeg, text-to-speech) | 015 | 020, 022 |

Data passed between modules (product spec §6) always goes through the shared profile or catalog:
Mu'eed → Mizan (course descriptions, via 002) · CodeJudge → CareerMap (weak points, via profile) ·
CareerMap → Tadreeb (required skills, via profile) · profile → Kitabi (the student's courses).

## 4. Assumptions & Decisions

| # | Decision | Rationale |
|---|---|---|
| R1 | A **tenant is one college** (faculty), not a whole university. | Regulations, divisions, courses, and Student Affairs are per college; the spec's scalability claim is "any other college". A university with several colleges gets several tenants (grouping is 023). |
| R2 | The course catalog is its own core feature (002) rather than part of the Mu'eed chatbot feature. | Kitabi, CodeJudge, Mizan, and the timetable all need it; building it once avoids each module inventing courses. |
| R3 | MVP = 001–009: foundation, catalog, all of Mu'eed, Kitabi, CodeJudge, and the pilot-readiness gate. | Matches the spec's "strongest modules for the demo" and its security statement; Mizan (light), CareerMap, Tadreeb follow as M3 exactly as the spec prioritises. |
| R4 | Kitabi (004) is built before CodeJudge (005). | Kitabi needs no extra infrastructure; CodeJudge needs a separately hosted sandbox. Order between 004 and 005 can be swapped without consequence. |
| R5 | The shared AI infrastructure is built inside 003, not as a separate feature. | It is only valuable with a first consumer (simplicity principle). |
| R6 | Real payments stay in sandbox mode through the MVP. | Product spec §11: a merchant account needs the college's approval. |
| R7 | AI-generated visuals are produced as code (Mermaid/SVG) or as background images with text composed in code; videos are composed with FFmpeg. | Product spec §11 mitigations; made mandatory here. |
| R8 | Pilot hosting is Vercel + Neon free tiers; the production/commercial target is Docker + PostgreSQL. | Free for the pilot; portable for universities that require local hosting (constitution, stack table). |
| R9 | Each feature is specified just before it is built; this roadmap fixes order and boundaries, not designs. | Avoids stale specs; decisions listed under "Decide in its plan" are deliberately deferred. |

## 5. Open questions for the owner

1. **Printed or PDF textbooks?** (product spec §12) — decides whether 024 is needed and affects 004's
   delivery flow. Needed before specifying 004.
2. **Does the college issue institutional email addresses to students?** — feature 001 supports both (domain
   restriction or open registration + roster verification in 002), but the pilot configuration depends on it.
3. **Which programming languages do the pilot courses use?** — 005 assumes Python and C++.
4. **Budget for paid services** (LLM usage, a small VM for the code sandbox) — affects model tier in 003 and
   hosting in 005.

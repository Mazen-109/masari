# Product

<!-- impeccable:product-schema 1 -->

<!--
Written by the implementer of feature 001 PR-8 (task T034, research.md §22) without an owner interview:
every fact below is taken from the constitution (.specify/memory/constitution.md), docs/roadmap.md, the
product specification (docs/masari-spec-en.html), and specs/001-platform-foundation/. Facts marked
"(inferred)" are reasonable readings of those documents that the owner has not confirmed.
-->

## Platform

web

## Users

Four roles, each in one college (one account belongs to exactly one college):

- **Student** (طالب): an undergraduate at an Egyptian college, from the first day to graduation and the
  first job. Mostly on a phone, often on mobile data and mid-range Android devices (inferred), reading
  Arabic first. Jobs: register and complete the academic profile, then use the college's modules.
- **Faculty member** (عضو هيئة تدريس): teaches courses; reviews what the system suggests (grades,
  plagiarism, exam analysis, AI drawings) before anything is published.
- **Student Affairs** (شئون الطلاب): keeps student records correct (student code, level, division) and
  answers students' administrative questions.
- **College administration** (إدارة الكلية): invites staff, manages divisions and settings, turns modules on
  and off for the college.

A platform operator (outside any college) creates and suspends colleges with command-line tools; there is
no operator UI.

## Product Purpose

Masari (مساري, "my path") accompanies a university student from the first day of college to graduation and
employment, and gives the college's staff one place to serve them. Six modules — Mu'eed (regulations
assistant, timetables, Student Affairs dashboard), CodeJudge (programming assignments and automatic
grading), Mizan (exam analysis), Kitabi (textbooks and access codes), CareerMap (CV analysis and learning
plan), Tadreeb (internships) — share one foundation: accounts, roles, one shared student profile, and the
college's settings. Success for the pilot: one college uses it for real, in Arabic, without staff having
to work around it.

## Positioning

Built for Egyptian college reality rather than translated from a foreign tool: Arabic and right-to-left
first, the terms students actually use (الفرقة، الشعبة، شئون الطلاب، كود الطالب، اللائحة), local payment
(Fawry), and one student profile shared by every module. Multi-tenant from day one so it can be licensed
to other universities.

## Operating Context

- Screens are working tools (Impeccable mode: **Operate**): forms, lists, settings, dashboards. Students
  open them between lectures, often one-handed on a phone; staff use desktops in college offices
  (inferred).
- Every screen exists in Arabic (default, `/ar`) and English (`/en`); the language switch is on every
  screen and keeps the current page.
- Official content (regulations, receipts, announcements) is formal Modern Standard Arabic; Egyptian
  colloquial Arabic only where the product spec asks for it.
- Phased delivery (docs/roadmap.md): foundation → Mu'eed, CodeJudge, Kitabi → Mizan, CareerMap, Tadreeb →
  AI layer.

## Capabilities and Constraints

- Western digits (0–9) in both languages; Gregorian dates in the `Africa/Cairo` time zone.
- Emails, URLs, student codes, and other left-to-right fragments are isolated inside Arabic text.
- Pages must stay light: a script budget per page is enforced in CI (FR-043).
- No third-party requests at runtime for fonts, images, or analytics; fonts are served by the app.
- Light theme only for now (research.md §22); a dark theme is an open decision, not a promise.
- Paid content (Kitabi), AI features, and human-review rules follow constitution principles VIII–XII.

## Brand Commitments

- Name: «مساري» in Arabic, "Masari" in English; the Arabic name is the primary wordmark.
- Tone: calm, trustworthy, academic. Clear, polite, direct sentences; no slang in the interface, no
  exclamation marks, no marketing superlatives.
- No decorative gradients, stock photography, or mascots (research.md §22).
- No logo exists yet; the wordmark is set in type. Do not invent a logo mark.

## Evidence on Hand

- Product specification: `docs/masari-spec-en.html` (rendered as `docs/masari-spec-en.pdf`).
- No real student data, testimonials, partner logos, or usage numbers exist; never fabricate them. Demo
  data comes only from the seed script.

## Product Principles

1. Arabic first: design and verify right-to-left before left-to-right; English is complete, not primary.
2. A person decides: the system informs faculty and staff and never penalises a student automatically.
3. One profile, many modules: modules read and write the shared student profile, never a private copy.
4. Show what you hold: a student can see the data kept about them, and nobody sees more than their role
   needs.
5. Calm over clever: predictable patterns, plain words, and fast pages beat novelty.

## Accessibility & Inclusion

WCAG 2.1 AA in both languages and both directions: contrast ≥ 4.5:1 for text (3:1 for large text and UI
parts), visible focus, keyboard-complete flows, a skip link on every screen, touch targets ≥ 44×44 px,
usable at 320 px width and 200 % zoom, `prefers-reduced-motion` respected. Automated axe scans run on every
screen in end-to-end tests.

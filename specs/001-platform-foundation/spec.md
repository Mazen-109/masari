# Feature Specification: Platform Foundation

**Feature Branch**: `001-platform-foundation` (delivered as one branch + pull request per PR batch, see `tasks.md`)

**Created**: 2026-11-14

**Status**: Ready for implementation

**Input**: User description: "The foundation of Masari: project skeleton and automated checks, accounts and
sign-in, colleges as isolated tenants, the four roles with separate permissions, the shared student
profile, and an Arabic-first right-to-left application shell with English support — everything the six
modules need before any of them can be built." (Product spec §2, §6, §7, §10: *"Foundation: accounts,
permissions, and the shared database."*)

## Overview

Masari serves students, faculty members, Student Affairs, and college administration through six modules
that all share one student profile. This feature delivers the common ground: people can get an account in
their college, sign in, see an Arabic home screen appropriate to their role, and the college's
administration can manage its people and settings — with each college's data fully isolated from every
other college's. No module functionality is delivered here; each module appears as a "coming soon" entry
so the navigation, permissions, and per-college module switches are in place.

**Terms used in this spec**

| Term | Arabic (UI) | Meaning |
|---|---|---|
| College | الكلية | One customer institution of the platform (a faculty of a university). The unit of data isolation. |
| Student | طالب | Role 1 of 4. |
| Faculty member | عضو هيئة تدريس | Role 2 of 4. |
| Student Affairs | شئون الطلاب | Role 3 of 4. |
| Administration (admin) | إدارة الكلية | Role 4 of 4; manages the college's people and settings. |
| Operator | — | The Masari team member who onboards colleges; not a role inside a college. |
| Level | الفرقة | The student's academic year (1 … number of levels in the college). |
| Division | الشعبة | The student's specialisation track within the college. |
| Student code | كود الطالب | The identifier the college assigned to the student. |
| Academic profile | البيانات الأكاديمية | Student code + level + division: the first part of the shared student profile. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A student joins their college and reaches an Arabic home screen (Priority: P1)

A student opens Masari on their phone, creates an account for their college with their name, email, and a
password, accepts the privacy notice, confirms their email from a message they receive, signs in, and
lands on a home screen in Arabic (right-to-left) that greets them by name, shows their college, and lists
the modules available to students as "coming soon". They can switch the whole interface to English and
back, and sign out.

**Why this priority**: nothing else in Masari can be used without an account and a working, Arabic-first
shell; it is the smallest slice that can be shown to a real student.

**Independent Test**: with only the demo college present, a new person can register, confirm their email,
sign in, see the Arabic home screen, switch language, and sign out — on a 360 px wide phone screen and on a
desktop.

**Acceptance Scenarios**:

1. **Given** a visitor on the registration screen for an active college, **When** they submit a valid name,
   email, password (10+ characters), and tick the privacy consent, **Then** they see a "check your email"
   screen and receive one email (Arabic first, English below) containing a confirmation link.
2. **Given** a registered but unconfirmed student, **When** they open the confirmation link within 24 hours,
   **Then** they see a success screen with a link to sign in, and they are not signed in automatically.
3. **Given** a confirmed student, **When** they sign in with correct email and password, **Then** they land
   on their home screen in the language they last chose (Arabic for a new account), with the page laid out
   right-to-left in Arabic.
4. **Given** a signed-in student on any screen, **When** they use the language switch, **Then** the same
   screen is shown in the other language and direction, and the choice is remembered at their next sign-in
   on any device.
5. **Given** a wrong email or wrong password, **When** the visitor tries to sign in, **Then** they see one
   generic message that does not say which of the two was wrong.
6. **Given** a student whose email is not yet confirmed, **When** they sign in with the correct password,
   **Then** they are not signed in, are told to confirm their email, and can request a new confirmation
   email.
7. **Given** an email that already has an account, **When** someone registers with it again, **Then** the
   screen shows the same "check your email" result as a new registration, no second account is created,
   and the email's owner receives a message saying they already have an account.
8. **Given** a college that restricts registration to its email domains, **When** a visitor registers with
   an address outside those domains, **Then** registration is refused with a message naming the accepted
   domains.
9. **Given** a signed-out visitor, **When** they open a signed-in screen's address, **Then** they are sent
   to the sign-in screen and, after signing in, arrive at the screen they asked for.
10. **Given** a signed-in user, **When** they choose "sign out", **Then** their session ends and signed-in
    screens are no longer reachable with the browser's back button.

---

### User Story 2 - A student completes the shared academic profile (Priority: P1)

On first sign-in a student is asked for their student code, level, and division — the data every module
will rely on. They cannot skip this step. Afterwards they can see their profile and update their name,
level, and division; their student code can only be corrected by the college administration.

**Why this priority**: the shared student profile is the integration point of all six modules (product
spec §6); Kitabi, CodeJudge, and the timetable all need level and division.

**Independent Test**: a newly registered student signs in, is taken to the profile-completion step, fills
it in, reaches the home screen showing their level and division, edits their level on the profile screen,
and sees the change on the home screen.

**Acceptance Scenarios**:

1. **Given** a student without an academic profile, **When** they sign in or open any signed-in screen,
   **Then** they are taken to the profile-completion step and cannot reach other screens until it is done.
2. **Given** the profile-completion step, **When** the student enters a student code, picks a level from 1
   to the college's number of levels, and picks one of the college's active divisions, **Then** the profile
   is saved and they arrive at the home screen, which shows their code, level, and division.
3. **Given** a student code already used by another student of the same college, **When** a student submits
   it, **Then** the profile is not saved and they are told the code is already in use and to contact the
   college administration.
4. **Given** two different colleges, **When** a student in each uses the same student code, **Then** both
   profiles are saved.
5. **Given** a student with a completed profile, **When** they change their name, level, or division on the
   profile screen, **Then** the change is saved and visible immediately; the student code is shown but not
   editable.
6. **Given** a faculty member, Student Affairs employee, or administrator, **When** they sign in, **Then**
   they are never asked for an academic profile, and their profile screen offers only name and language.

---

### User Story 3 - A user recovers a forgotten password (Priority: P2)

A user who forgot their password requests a reset from the sign-in screen, receives an email with a link,
sets a new password, and signs in with it. Every other session of that account ends.

**Why this priority**: forgotten passwords are the most common support request; without self-service
recovery the pilot would depend on manual intervention.

**Independent Test**: for an existing account, request a reset, open the emailed link, set a new password,
confirm the old password no longer works and the new one does.

**Acceptance Scenarios**:

1. **Given** the "forgot password" screen, **When** any email address is submitted (registered or not),
   **Then** the same confirmation message is shown, and an email with a reset link is sent only if the
   address belongs to an account.
2. **Given** a reset link less than 1 hour old and not yet used, **When** the user submits a valid new
   password, **Then** the password is changed, all existing sessions of that account end, and the user is
   told to sign in.
3. **Given** a reset link that is expired, already used, or altered, **When** it is opened or submitted,
   **Then** the password is not changed and the user is offered to request a new link.

---

### User Story 4 - The operator onboards a new college and its first administrator (Priority: P2)

A Masari operator adds a new college (short identifier, Arabic and English names) and the email of its
first administrator, without any code change. The operator receives an invitation link to pass to that
person, who opens it, sets their name and password, signs in, and sees the administration area of their —
and only their — college.

**Why this priority**: Masari is meant to be offered to many colleges; onboarding without code changes and
with guaranteed isolation is what makes that possible, and the first administrator is the root of every
other staff account.

**Independent Test**: create two colleges with the operator tool, accept both administrator invitations,
and verify that each administrator sees only their own college's name, divisions, and people.

**Acceptance Scenarios**:

1. **Given** the operator tool, **When** the operator supplies a new identifier, both names, and an
   administrator email, **Then** the college exists with default settings (4 levels, all six modules
   enabled, no email-domain restriction, a "General" division) and the tool outputs a single-use
   invitation link valid for 7 days.
2. **Given** a valid invitation link, **When** the invitee opens it, **Then** they see the college name and
   the role they are invited to, and can set their name and password; on submit their account is created
   with that role and a confirmed email, and they can sign in immediately.
3. **Given** an invitation link that is expired, revoked, already used, or altered, **When** it is opened,
   **Then** no account can be created and a clear message tells the person to ask for a new invitation.
4. **Given** two colleges A and B each with users and divisions, **When** any user of A uses any screen or
   action, **Then** no data of B is ever shown or changed — including when identifiers of B's records are
   supplied directly.
5. **Given** the operator suspends a college, **When** any of its users tries to sign in or continue using
   a session, **Then** access is refused with a message that the college's access is suspended, and other
   colleges are unaffected.
6. **Given** an identifier that is already used, **When** the operator tries to create a college with it,
   **Then** the tool reports the conflict and changes nothing.

---

### User Story 5 - The college administration invites staff, and each role sees only what it may use (Priority: P2)

An administrator invites faculty members, Student Affairs employees, other administrators (and, where
needed, students who cannot self-register) by email with a chosen role. Invitees receive an email with a
link and join with that role. Once signed in, each role sees only the navigation entries and screens it is
permitted to use; trying to open anything else behaves as if it does not exist.

**Why this priority**: the product spec requires "separate permissions for each role"; staff roles must
never be obtainable by self-registration.

**Independent Test**: an administrator invites one person per role; each accepts and signs in; for each
role verify the navigation matches the permission table and that every non-permitted screen and action is
refused.

**Acceptance Scenarios**:

1. **Given** an administrator on the invitations screen, **When** they submit an email and a role, **Then**
   a pending invitation appears in the list and the person receives a bilingual email with the link.
2. **Given** an email that already has an account or already has a pending invitation in this college,
   **When** the administrator tries to invite it, **Then** no invitation is created and the administrator is
   told this email cannot be invited.
3. **Given** a pending invitation, **When** the administrator revokes it, **Then** its link stops working
   immediately and it is shown as revoked.
4. **Given** a signed-in user of any role, **When** they look at the navigation and home screen, **Then**
   they see exactly the modules and areas their role is permitted (see permission table, FR-014) that are
   enabled for their college.
5. **Given** a signed-in user, **When** they open the address of a screen their role is not permitted to
   use, or trigger an action their role is not permitted to perform, **Then** the screen is reported as not
   found, the action is refused, and no restricted data is returned.
6. **Given** a person with a pending invitation, **When** they try to self-register with the same email,
   **Then** no account is created, the screen shows the usual "check your email" result, and they receive an
   email telling them to use their invitation link.

---

### User Story 6 - The college administration manages its people (Priority: P3)

An administrator finds any user of their college, sees their role and status, changes a role, suspends or
reactivates an account, and corrects a student's academic data.

**Why this priority**: needed to run a pilot (mistyped student codes, staff changes, misuse), but the
platform is usable for a first demo without it.

**Independent Test**: as an administrator, search for a student by code, correct their level, change
another user's role, suspend them and verify they are signed out and cannot sign in, then reactivate them.

**Acceptance Scenarios**:

1. **Given** the people screen, **When** the administrator searches by part of a name, email, or student
   code, or filters by role or status, **Then** matching users of their own college are listed 20 per page
   with name, email, role, status, and (for students) code, level, and division.
2. **Given** another user of the same college, **When** the administrator changes their role, **Then** the
   new role applies to that user's very next request.
3. **Given** another user of the same college, **When** the administrator suspends them, **Then** all of
   that user's sessions end immediately, they cannot sign in, and they are told their account is suspended;
   reactivating restores sign-in.
4. **Given** the administrator's own account, **When** they try to change their own role or suspend
   themselves, **Then** the action is refused.
5. **Given** a student of the same college, **When** the administrator edits their student code, level, or
   division, **Then** the same validation rules as for students apply and the change is saved.
6. **Given** a user of a different college, **When** an administrator supplies that user's identifier to any
   people-management action, **Then** the action reports "not found" and nothing changes.

---

### User Story 7 - The college administration configures the college (Priority: P3)

An administrator edits the college's names, the email domains allowed for student self-registration, the
number of levels, the list of divisions, and which of the six modules are enabled.

**Why this priority**: lets a college adapt Masari without the operator; defaults are sufficient for the
first demo.

**Independent Test**: as an administrator, add a division, restrict registration to one email domain,
disable one module; then verify a new student sees the new division, a registration from another domain is
refused, and the disabled module is gone from every role's navigation.

**Acceptance Scenarios**:

1. **Given** the settings screen, **When** the administrator changes the Arabic or English name, **Then**
   the new name appears in the header for all the college's users.
2. **Given** the settings screen, **When** the administrator sets allowed email domains, **Then** student
   self-registration for this college accepts only those domains; an empty list accepts any email.
3. **Given** students already at level 4, **When** the administrator tries to reduce the number of levels
   below 4, **Then** the change is refused with an explanation.
4. **Given** the divisions screen, **When** the administrator adds a division with a code unique in the
   college and Arabic and English names, **Then** it becomes selectable by students; a duplicate code is
   refused.
5. **Given** a division used by existing students, **When** the administrator deactivates it, **Then** it
   is no longer offered for selection, existing students keep it, and it can be reactivated.
6. **Given** the settings screen, **When** the administrator disables a module, **Then** it disappears from
   the navigation and home of every role in that college, and its address is reported as not found.

---

### Edge Cases

- **Shared campus networks**: hundreds of students may register or sign in from one network address in the
  same hour; protection against guessing must not lock out a lecture hall (see FR-009).
- **Email prefetching**: mail scanners may open confirmation links before the user does; opening a
  confirmation link twice shows success both times within its validity.
- **Mixed-direction text**: emails, student codes, and Latin names inside Arabic sentences must display in
  the correct order; Arabic names in the English interface likewise.
- **Very long or unusual names**: names up to 100 characters, with Arabic diacritics or multiple parts,
  display without breaking the layout.
- **Lost invitation**: an expired or lost invitation is replaced by revoking it and inviting again; the old
  link never works again.
- **Race on student code**: two students submitting the same code at the same moment — exactly one succeeds.
- **Race on invitation**: an invitation link submitted twice at the same moment creates exactly one account.
- **Role change or suspension during a session**: takes effect on the user's next request, not at next
  sign-in.
- **College suspended during a session**: the user's next request ends their access with an explanation.
- **Deactivated division on a profile**: the student keeps it and sees it when editing, but cannot pick
  another deactivated division.
- **Last administrator**: an administrator can never remove their own administrator role or suspend
  themselves, so a college always keeps at least one active administrator — also when two administrators
  demote or suspend each other at the same moment (one of the two changes is refused).
- **Unsupported language in the address**: reported as not found; the bare site address opens in Arabic.
- **Return address after sign-in**: only addresses inside Masari are honoured; anything else is ignored.
- **Email delivery failure**: the user can request the message again (within the limits of FR-009); the
  failure is recorded without storing the email content.
- **JavaScript unavailable or slow**: registration, sign-in, and recovery forms still submit and show
  errors.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts and sign-in**

- **FR-001**: A visitor MUST be able to create a student account by choosing a college and providing a
  full name (2–100 characters), an email address, a password, and explicit consent to the privacy notice.
- **FR-002**: The registration screen MUST list only active colleges; the college MUST be preselected when
  the visitor arrives through a college-specific link or when only one active college exists.
- **FR-003**: When a college has configured allowed email domains, self-registration MUST be accepted only
  for emails in those domains; when it has none, any email MUST be accepted.
- **FR-004**: A self-registered account MUST confirm its email through an emailed link (valid 24 hours)
  before it can sign in; the user MUST be able to request the email again. Confirming MUST NOT sign the
  user in.
- **FR-005**: Registration, confirmation-resend, and password-recovery responses MUST NOT reveal whether an
  email address has an account. A registration attempt for an existing account MUST send that address an
  "you already have an account" email instead of creating anything.
- **FR-006**: Users MUST sign in with email and password. Failed sign-in MUST show one generic message;
  the "email not confirmed" and "account suspended" messages MUST be shown only when the password was
  correct.
- **FR-007**: Passwords MUST be 10–128 characters with no composition rules, and MUST be stored only in a
  form from which the password cannot be recovered.
- **FR-008**: A session MUST last 7 days from last use at most, MUST end on sign-out, and MUST be
  unusable by scripts in the page. A signed-out visitor requesting a signed-in screen MUST be sent to
  sign-in and then returned to the requested screen (only addresses inside Masari are honoured).
- **FR-009**: The system MUST limit repeated attempts, per email address and per network address, with
  these limits (attempts / window): sign-in 10 / 10 min per email and 100 / 10 min per network address;
  registration 3 / hour per email and 60 / 10 min per network address; confirmation resend 3 / hour per
  email and 60 / 10 min per network address; password-recovery request 3 / hour per email and 60 / 10 min per network address; invitation
  acceptance 30 / 10 min per network address. When a limit is hit, the user MUST be told to try again later
  and when.
- **FR-010**: Users MUST be able to recover a forgotten password through an emailed single-use link valid
  for 1 hour; setting a new password MUST end all of the account's sessions.
- **FR-011**: The system MUST show a privacy notice (what is collected, why, who can see it, how to
  request correction or deletion) in both languages, and MUST record the date and time each user consented.

**Roles and access**

- **FR-012**: Every user MUST belong to exactly one college and have exactly one of four roles: student,
  faculty member, Student Affairs, administration.
- **FR-013**: Self-registration MUST always create a student. Any other role MUST be obtainable only by
  invitation or by an administrator's role change.
- **FR-014**: The system MUST enforce this permission table on every screen and every action, on the
  server, denying anything not listed:

  | Capability | Student | Faculty member | Student Affairs | Administration |
  |---|---|---|---|---|
  | Home screen, own account (name, language), sign out | ✓ | ✓ | ✓ | ✓ |
  | Maintain own academic profile | ✓ | – | – | – |
  | Mu'eed (معيد) | ✓ | – | ✓ | – |
  | CodeJudge | ✓ | ✓ | – | – |
  | Mizan (ميزان) | – | ✓ | – | – |
  | Kitabi (كتابي) | ✓ | – | – | ✓ |
  | CareerMap | ✓ | – | – | – |
  | Tadreeb (تدريب) | ✓ | – | – | ✓ |
  | Manage people | – | – | – | ✓ |
  | Manage invitations | – | – | – | ✓ |
  | Manage college settings, divisions, and enabled modules | – | – | – | ✓ |

- **FR-015**: A screen the user's role may not use MUST be reported as not found, and a refused action
  MUST return no restricted data.
- **FR-016**: Navigation and the home screen MUST show exactly the entries that the user's role is
  permitted and the college has enabled.

**Colleges (tenants)**

- **FR-017**: Data belonging to one college MUST never be readable or changeable by a user of another
  college. This MUST be enforced where data is stored, independently of the screens, so that a mistake in
  one screen cannot expose another college's data.
- **FR-018**: An operator MUST be able, without code changes, to create a college (unique identifier of
  3–40 lowercase letters, digits, and hyphens; Arabic and English names) together with an invitation for
  its first administrator, and to suspend or reactivate a college.
- **FR-019**: While a college is suspended, none of its users can sign in or use an existing session; they
  MUST be told the college's access is suspended.

**Invitations**

- **FR-020**: An administrator MUST be able to invite an email address to any of the four roles. An
  invitation MUST be single-use and valid for 7 days. At most one pending invitation per email per college
  may exist. An email that already has an account MUST NOT be invitable. An
  administrator MUST NOT be able to create more than 60 invitations per hour.
- **FR-021**: An invitee MUST be able to accept by setting their name and password; the account is created
  in the inviting college with the invited role and a confirmed email (no separate confirmation step).
- **FR-022**: An administrator MUST be able to see the college's invitations with their status (pending,
  accepted, expired, revoked) and revoke a pending one, which MUST disable its link immediately.
- **FR-023**: Self-registration with an email that has a pending invitation MUST NOT create an account; the
  address MUST receive an email telling them to use the invitation.

**Shared student profile**

- **FR-024**: A student without an academic profile MUST be required to complete it (student code, level,
  division) before reaching any other signed-in screen.
- **FR-025**: The student code MUST be 3–20 characters (letters, digits, hyphen), unique within the
  college, and not changeable by the student once saved.
- **FR-026**: The level MUST be between 1 and the college's number of levels; the division MUST be one of
  the college's active divisions (or the student's current division when editing).
- **FR-027**: Every user MUST be able to view their profile and change their name and language; students
  MUST additionally be able to change their level and division.
- **FR-028**: An administrator MUST be able to correct a student's code, level, and division under the
  same validation rules.

**People management**

- **FR-029**: An administrator MUST be able to list their college's users 20 per page, search by part of
  name, email, or student code, and filter by role and by status.
- **FR-030**: An administrator MUST be able to change another user's role; the change MUST apply from that
  user's next request. An administrator MUST NOT be able to change their own role.
- **FR-031**: An administrator MUST be able to suspend and reactivate another user. Suspension MUST end all
  of that user's sessions immediately and prevent sign-in. An administrator MUST NOT be able to suspend
  themselves.

**College settings**

- **FR-032**: An administrator MUST be able to edit the college's Arabic and English names (1–120
  characters each), its allowed email domains (0–20 domains), and its number of levels (1–7, never below
  the highest level currently held by any of its students).
- **FR-033**: An administrator MUST be able to add a division (code of 1–16 uppercase letters, digits,
  hyphen, or underscore, unique within the college; Arabic and English names of 1–80 characters; display
  order), edit its names and order, and deactivate or reactivate it. Divisions are never deleted; a
  deactivated division is not offered for selection but remains on existing profiles.
- **FR-034**: An administrator MUST be able to enable or disable each of the six modules for the college.
  A disabled module MUST disappear from navigation and home for every role and its screens MUST be
  reported as not found.
- **FR-035**: Each of the six modules MUST appear, for the roles permitted by FR-014 when enabled, as a
  navigation entry and a home-screen card leading to a "coming soon" screen with the module's name and a
  one-sentence description.

**Language and application shell**

- **FR-036**: Every screen and message MUST be available in Arabic (default, right-to-left) and English
  (left-to-right). A language switch MUST be present on every screen and MUST keep the user on the same
  screen. The bare site address MUST open in Arabic.
- **FR-037**: A signed-in user's language choice MUST be remembered with their account and applied after
  sign-in on any device.
- **FR-038**: Every email the system sends MUST contain the Arabic text first and the English text below
  it, each in its correct direction.
- **FR-039**: Signed-in screens MUST share one shell: the college's name, the language switch, a user menu
  (profile, sign out), and role-aware navigation, usable from a 320 px wide phone to a desktop.
- **FR-040**: The home screen MUST greet the user by name and show their college and their module cards;
  students additionally see their code, level, and division; administrators additionally see shortcuts to
  people, invitations, divisions, and settings.
- **FR-041**: Numbers MUST be shown with Western digits (0–9) in both languages; dates MUST use the
  Gregorian calendar and Cairo time.

**Accessibility and responsiveness**

- **FR-042**: All screens MUST meet WCAG 2.1 level AA in both languages: every flow completable by
  keyboard with visible focus, a skip-to-content link, labelled form fields, errors announced and attached
  to their fields, sufficient contrast, usable at 200% zoom.
- **FR-043**: Screens MUST stay within these budgets on a mid-range phone on a 4G connection: main content
  visible within 2.5 s, response to a tap within 200 ms, no visible layout jumps, and no more than 200 KB
  (public screens) / 300 KB (signed-in screens) of script transferred on first load.

**Audit, protection, and delivery**

- **FR-044**: The system MUST keep a per-college, append-only record of security-relevant events — sign-in,
  sign-out, registration, password reset, invitation created/revoked/accepted, role change, suspension and
  reactivation, academic-profile creation and change, college-settings change, division change, module
  enable/disable — with who did it, to what, and when. The record MUST NOT contain passwords, links, or
  codes that grant access.
- **FR-045**: The system MUST offer a status check that reports whether the application and its data store
  are working, without exposing any data.
- **FR-046**: Every proposed change to the product MUST be checked automatically — code quality, automated
  tests, a production build, completeness of both languages, right-to-left rules, accessibility, the script
  budget, leaked secrets, and known-vulnerable dependencies — and MUST NOT be mergeable while any check
  fails.
- **FR-047**: A developer MUST be able to start the whole system locally with a demo college by following a
  written quickstart, with no access to any paid or external service.
- **FR-048**: The system MUST apply standard browser protections on every response: it cannot be embedded
  in other sites, content types are not guessed, scripts and styles load only from Masari itself, and
  state-changing requests from other sites are refused.
- **FR-049**: Signed-in screens and the pilot site as a whole MUST ask search engines not to index them.

### Key Entities

- **College (tenant)**: an institution using Masari. Identifier, Arabic and English names, status
  (active/suspended), allowed email domains, number of levels, enabled modules. Owns all other data below.
- **User**: a person's account in exactly one college. Name, email (unique across the platform), role,
  status (active/suspended), preferred language, email-confirmed flag, privacy-consent time.
- **Academic profile**: a student's code, level, and division in their college — the first part of the
  shared student profile that later features extend (courses, grades, skills).
- **Division**: a specialisation track of a college. Code, Arabic and English names, active flag, order.
- **Invitation**: an offer for an email address to join a college with a role. Status, expiry, who created
  it, who accepted it.
- **Audit event**: one recorded security-relevant action in a college. Actor, action, target, time.
- **Module switch**: whether each of the six modules is enabled for a college.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new student completes registration, email confirmation, and the academic profile in under
  3 minutes of active time on a phone.
- **SC-002**: 100% of screens, messages, and emails are available in both Arabic and English, and Arabic
  screens show no left-to-right layout defects in an audit of every screen delivered by this feature.
- **SC-003**: In automated isolation tests covering every kind of college-owned data, the number of
  successful cross-college reads or writes is zero, on every change.
- **SC-004**: For every role and every capability in the permission table, automated tests confirm that
  permitted use succeeds and non-permitted use is refused (100% of the table covered).
- **SC-005**: Automated accessibility checks report zero serious or critical issues on every screen in both
  languages, and every user story can be completed using only the keyboard.
- **SC-006**: On a mid-range phone profile with a 4G connection, each primary screen shows its main content
  within 2.5 seconds and stays within the script budgets of FR-043.
- **SC-007**: An operator onboards a new college, and its first administrator signs in, in under 15 minutes
  with no code change.
- **SC-008**: A developer with the prerequisites installed gets the system running locally with the demo
  college in under 15 minutes by following the quickstart.
- **SC-009**: Every proposed change receives its full automated verdict within 15 minutes, and no change
  reaches the main line with a failing check.
- **SC-010**: In a hallway test with 5 students of the pilot college, at least 4 register and reach their
  home screen without help.

## Assumptions & Decisions

Interactive clarification was replaced by the decisions below (the owner asked the architect to decide and
record). Each can be revisited by amending this spec.

| # | Decision | Rationale |
|---|---|---|
| D1 | A tenant is one **college**; every user belongs to exactly one college and email addresses are unique across the platform. | Regulations, divisions, and Student Affairs are per college; one-college-per-user keeps isolation simple. A person working at two colleges uses two email addresses. |
| D2 | Identity is **email + password**. No national ID, phone number, or address is collected. | Works whether or not the college issues institutional emails; data minimisation. Single sign-on with Microsoft/Google is deferred to roadmap feature 023. |
| D3 | Student self-registration is **open to any email unless the college lists allowed domains**; the academic profile is self-declared. | The pilot college's email situation is unknown; roadmap feature 002 adds the official roster import that verifies students and locks their data. |
| D4 | Staff roles are obtainable **only by invitation or administrator role change**. | Prevents privilege escalation through registration. |
| D5 | Confirming an email does **not** sign the user in. | The link may be opened on another device or by a mail scanner; one sign-in path is simpler and safer. |
| D6 | Non-permitted screens are reported as **not found** rather than "forbidden". | Does not reveal which administrative screens exist; one behaviour to test. |
| D7 | All emails are **bilingual in one message** (Arabic first). | No dependency on knowing the recipient's language (invitees have no account yet); one template per email. |
| D8 | **Western digits and the Gregorian calendar** in both languages. | Student codes, prices, and dates stay consistent across screens, emails, and exports; common in Egyptian web products. |
| D9 | The operator onboards colleges with a **command-line tool**, not a screen. | Only the Masari team onboards colleges during the pilot; an operator console is roadmap feature 023. |
| D10 | Password length **10–128, no composition rules**. | Follows current guidance favouring length over complexity; a breached-password check is added in feature 009. |
| D11 | An administrator can never change their own role or suspend themselves. | Guarantees a college always has an active administrator without counting logic. |
| D12 | Divisions are deactivated, never deleted; users are suspended, never deleted in this feature. | Preserves history other modules will reference; account deletion/export for privacy requests is delivered in feature 009 before the pilot. |
| D13 | The student code is fixed by the student once and corrected only by an administrator. | Reduces impersonation of another student's code while allowing typo fixes. |
| D14 | Module permissions per role follow the product spec's module table exactly; administration sees Kitabi and Tadreeb only. | The spec assigns each module its primary users; each module's own spec may widen access later. |
| D15 | The audit record is written in this feature; a screen to browse it is delivered in feature 009. | The data must exist from day one; the viewer is not needed for the first demo. |
| D16 | Light theme only; no in-app notifications; no profile photo. | Not required by the product spec's foundation; avoids scope creep. |
| D17 | The privacy notice text is a plain-language draft written during implementation and **must be reviewed by the owner (and the college) before the pilot**. | Legal wording under Egypt's Personal Data Protection Law is the owner's responsibility. |

**Other assumptions**

- Users have a smartphone or computer with a modern browser (versions from the last two years) and an
  internet connection; there is no offline mode and no native mobile app.
- The pilot runs with one college and up to about 5,000 users; the design must not prevent tens of
  colleges.
- Email is delivered through a provider chosen and paid for (or free-tier) by the owner; in development
  and automated tests no real email is sent.
- Out of scope for this feature: course catalog and roster import (002), any module functionality
  (003+), payments, file uploads, AI features, operator console, single sign-on, account deletion.

# Masari (مساري)

Masari ("my path") is a multi-tenant platform that accompanies a university student from the first day
of college to graduation and employment, and serves faculty, Student Affairs, and college
administration. Each college is a separate tenant. Six modules — Mu'eed, CodeJudge, Mizan, Kitabi,
CareerMap, and Tadreeb — share one foundation: accounts, roles and permissions, the shared student
profile, and an Arabic-first, right-to-left interface with English.

## Status

Feature 001 — **Platform Foundation** — is implemented: student registration with email confirmation,
sign-in and password recovery, the academic profile, colleges created by an operator, staff invitations,
role-based access for the four roles, people management, college settings and divisions, the bilingual
signed-in shell with placeholders for the six modules, and browser protections. Every requirement is
traced to the pull request that delivered it in
[traceability.md](specs/001-platform-foundation/traceability.md). One gap remains open: under the Lighthouse mobile
preset, `/ar/sign-in` and `/ar/dashboard` show their main content in 3.0 s and 3.9 s, above the 2.5 s target of FR-043. The next features are listed in the
[roadmap](docs/roadmap.md).

## Documents

- [Constitution](.specify/memory/constitution.md) — the binding rules for every feature and pull request
- [Roadmap](docs/roadmap.md) — features and releases in delivery order
- [Product specification](docs/masari-spec-en.html) ([PDF](docs/masari-spec-en.pdf))
- [Feature 001 — Platform Foundation](specs/001-platform-foundation/spec.md) and its
  [requirement traceability](specs/001-platform-foundation/traceability.md)
- [Local setup and validation](specs/001-platform-foundation/quickstart.md)
- [Deployment](docs/deployment.md) — the pilot on Vercel, Neon, and an SMTP provider
- [Repository settings](docs/repo-settings.md) — required checks and branch protection
- [Agent working rules](CLAUDE.md) — stack, layout, commands, and the PR workflow

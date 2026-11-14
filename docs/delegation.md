# Delegating reviews and heavy tasks

This repo ships three skills from [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills)
in `.claude/skills/`. `skills-lock.json` records their content hashes (not a release tag), so review the
diff whenever you update them: the scripts run with your environment.

| Skill | What it does |
| --- | --- |
| `claude-delegate` | Hands a task to a separate `claude` CLI session, e.g. **Fable 5.2** (`claude-fable-5-2`) or **Opus 5.5** (`claude-opus-5-5`). |
| `codex-delegate` | Hands a task to the OpenAI **Codex** CLI (not used for now). |
| `delegate-setup` | Discovers installed CLIs and saves "lanes" (e.g. `review` → Fable). |

The orchestrator (your main Claude Code session) writes a brief, the implementer works, and the
orchestrator reviews the diff and commits. The relay never commits.

## Project workflow

- **Rules, spec, plan, tasks:** Fable 5.2 at `high` effort.
- **Implementation:** Opus 5.5 at `medium` effort.
- **Every PR:** reviewed by Fable 5.2 (read-only) before merge.

## Review a PR with Fable 5.2

A `--read-only` run has only Read/Glob/Grep, so it cannot run `git diff` itself. Save the diff to a file
inside the repo's ignored area (or paste it in the brief) before dispatching:

```bash
git diff origin/main...HEAD > .git/review.diff
node .claude/skills/claude-delegate/scripts/relay.mjs --brief brief.txt --cd . \
  --read-only --model claude-fable-5-2 --effort high
```

The brief should point at `.git/review.diff` and ask for a `VERDICT: APPROVE` or
`VERDICT: CHANGES_REQUESTED` line.

## Give a task to Opus 5.5 or Fable 5.2

In Claude Code, name the skill (or use `/claude-delegate`):

```text
Use claude-delegate with --model claude-opus-5-5 --effort medium to implement <task>, then review and commit it.
```

## Prerequisites

- `claude` CLI logged in (`claude auth status`), Node 18+, git.
- Write-mode runs enable Claude's shell sandbox and fail closed without it. On Linux install
  `bubblewrap` and `socat` (`apt-get install -y bubblewrap socat`); cloud sessions need this once per
  container. Read-only runs don't need it.
- **Codex** (optional): `npm i -g @openai/codex`, then `codex login` with your own OpenAI account.

## Updating

```bash
npx skills add amElnagdy/delegate-skills --skill claude-delegate --skill codex-delegate --skill delegate-setup --agent claude-code
```

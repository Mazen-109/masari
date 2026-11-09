# Delegating reviews and heavy tasks

This repo ships three skills from [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills)
in `.claude/skills/` (pinned in `skills-lock.json`):

| Skill | What it does |
| --- | --- |
| `claude-delegate` | Hands a task to a separate `claude` CLI session, e.g. on **Fable 5.2** (`claude-fable-5-2`). |
| `codex-delegate` | Hands a task to the OpenAI **Codex** CLI. |
| `delegate-setup` | Discovers installed CLIs and saves "lanes" (e.g. `review` → Fable, `heavy` → Codex). |

The orchestrator (your main Claude Code session) writes a brief, the implementer works, and the
orchestrator reviews the diff and commits. The relay never commits.

## Review a PR with Fable 5.2

Ask Claude Code:

```text
Use $claude-delegate with --model claude-fable-5-2 --read-only to review PR #<n> (diff vs main)
and report bugs, risks and missing tests. Don't edit anything.
```

`--read-only` runs Claude in `plan` mode with Read/Glob/Grep only, and reports a `readOnlyViolation`
tripwire in `result.json`.

## Give Fable or Codex a heavy task

```text
Use $claude-delegate with --model claude-fable-5-2 to implement <task>, then review and commit it.
Use $codex-delegate to implement <task>, then review and commit it.
```

## Prerequisites

- **Fable 5.2:** `claude` CLI logged in (`claude auth status`), Node 18+, git. Works out of the box in
  Claude Code cloud sessions.
- **Codex:** `npm i -g @openai/codex`, then `codex login` with your own ChatGPT/OpenAI account, on the
  machine where you run it. Not available in cloud sessions without your credentials.

## Updating

```bash
npx skills add amElnagdy/delegate-skills --skill claude-delegate --skill codex-delegate --skill delegate-setup --agent claude-code -y
```

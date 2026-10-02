---
layout: page
title: "Agent Orchestrator for OpenCode and Claude Code"
description: "An OpenCode plugin I built: a CTO agent that delegates to five persistent Claude Code sessions, with read-only modes enforced in code. 96 releases, 373 tests."
permalink: /projects/agent-orchestrator/
---

**Project:** `claude-opencode-subagents` (source private) &nbsp;·&nbsp; **Stack:** TypeScript, OpenCode plugin API, Claude Agent SDK, Vitest

**Timeline:** 22 March to 26 April 2026 &nbsp;·&nbsp; 244 commits &nbsp;·&nbsp; 96 tagged releases (v0.1.2 to v0.1.100) &nbsp;·&nbsp; 373 tests in 17 files, CI on lint, knip, typecheck, test, build

The [deep dive]({% post_url 2026-03-26-Building-an-Agent-Orchestrator-for-OpenCode %}) covers the code and tradeoffs.

## Problem

I wanted one agent to own a task while the hands-on work ran in Claude Code. One session that investigates, edits, and checks itself tends to edit early. A fresh session per step loses the context the last one built.

## Constraints

- Investigation must not edit files, enforced in code, not in the prompt.
- Engineers keep their Claude session across assignments and process restarts.
- Two OpenCode sessions in one repo must not share engineers.
- Undo in the manager session must also undo the engineers' work.

## Design

```text
cto (OpenCode, reads and delegates, never edits)
 ├─ dispatch_engineer ─> Tom | John | Maya | Sara | Alex   (persistent Claude Code sessions)
 ├─ plan_with_team ────> lead + challenger in parallel ─> write-restricted synthesis
 ├─ run_browser_qa ────> BrowserQA (Playwright, never writes)
 ├─ run_code_review ───> fresh read-only reviewer, focus inferred from changed paths
 └─ git, approval policy, team status, reset
```

- **Modes:** `explore` sessions get write tools and write-like Bash denied in the SDK `canUseTool` callback.
- **State:** one team file per CTO session, per-team write queue, atomic rename. Busy is a 15-minute lease, not a lock.
- **Context:** token, cost, then turn-count estimates drive warnings. Sessions reset only on a real context-exhausted error.
- **Signals:** `implement` raises review and verify flags. Verify clears only on `VERIFY_STATUS: pass`. Commits warn but do not block.
- **Undo:** a CTO revert sends `/undo` to each engineer's Claude session once per later assignment.

## What changed and why

| Date | Change | Why |
| --- | --- | --- |
| 23 Mar | Removed per-run git worktrees | One shared worktree, one implementing engineer at a time |
| 26 Mar | Worktree-wide "active team" replaced by one team per CTO session, 17 hours after shipping | Two sessions could share engineers |
| 16 to 17 Apr | Removed the engineer wrappers, the architect/planner wrapper, and the `claude` bridge tool | Two model hops per assignment; assignments now reach Claude verbatim |
| 23 to 26 Apr | Reviewer moved from Claude to an OpenCode agent on the CTO's model, fresh session per review | A different model family reviews, without the CTO's reasoning |

## Results

- 373 passing tests, including restart recovery, concurrent writes, and 19 undo cases.
- `/reflect` asks each engineer used in a session what in its instructions misled it.
- Known limits: single-writer is a prompt rule; Bash write detection is a regex list.

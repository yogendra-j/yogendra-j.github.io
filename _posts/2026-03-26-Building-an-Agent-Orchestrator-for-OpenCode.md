---
title: Building an Agent Orchestrator for OpenCode and Claude Code
date: 2026-03-26 00:00:00 +0530
categories: [ai, developer-tools]
tags: [opencode, claude-code, agents, orchestration, typescript]
description: How I built an OpenCode plugin that runs persistent Claude Code engineers, enforces read-only modes in code, and why I deleted two agent layers along the way.
image:
  path: /assets/img/og/posts/agent-orchestrator.jpg
  alt: "Building an Agent Orchestrator for OpenCode and Claude Code"
---

This post walks through `claude-opencode-subagents`, an OpenCode plugin I built that lets one manager agent delegate work to five persistent Claude Code sessions. You will see how roles map to tool permissions, how read-only exploration is enforced in the SDK callback, how state survives restarts, and which parts of the first design I removed and why.

The source is private. The numbers below come from its git history: 244 commits between 22 March and 26 April 2026, 96 tagged releases (v0.1.2 to v0.1.100), and 373 Vitest tests across 17 files, run in CI alongside lint, knip, typecheck, and build. The shorter case study is on the [project page]({{ '/projects/agent-orchestrator/' | relative_url }}).

## The shape today

```text
User
 └─ cto  (OpenCode primary agent; reads, delegates, reviews; never edits)
     ├─ dispatch_engineer ─> Tom | John | Maya | Sara | Alex
     │                       one persistent Claude Code session each
     │                       mode: explore (writes denied) | implement | verify
     ├─ plan_with_team ────> lead + challenger in parallel (explore)
     │                       └─ synthesis run (writes denied, not persisted)
     ├─ run_browser_qa ────> BrowserQA Claude session (Playwright, writes always denied)
     ├─ run_code_review ───> code-review agent (fresh OpenCode session, read-only)
     └─ git_*, approval_*, team_status, reset_engineer

State: .claude-manager/teams/<cto-session-id>.json, transcripts/, reviews/
```

By default the CTO runs on an OpenAI model in OpenCode, the engineers run Claude Opus (Sonnet for explore mode), and the reviewer inherits the CTO's model. The code is written by one model family and reviewed by another. All of it is configurable in `.claude-manager/config.jsonc`.

## Roles are permission sets, not personas

Each role is defined by what it can call. The CTO starts from `'*': 'deny'`, gets read-only inspection tools plus the 17 CTO tools, and has OpenCode's generic `task` delegation denied entirely, so it cannot spawn arbitrary subagents or itself. Every other agent gets the CTO tools denied globally.

The code-review agent is narrower still: deny everything, then allow `read`, `grep`, `glob`, `list`, `codesearch`, `lsp`, and one tool that fetches the saved diff. It cannot write its own review file. The `run_code_review` tool saves the artifact after the agent returns text.

The engineers are not OpenCode agents at all anymore. They are Claude Code sessions driven through the Claude Agent SDK, so their limits live in the SDK's `canUseTool` callback.

## Explore mode is enforced in the callback

Engineers run in `explore`, `implement`, or `verify` mode. Explore is read-only, and I did not want that to depend on the model following instructions. The orchestrator computes the flag per dispatch:

```ts
restrictWriteTools: input.mode === 'explore' || (workerCaps?.restrictWriteTools ?? false),
```

BrowserQA sets `restrictWriteTools: true` in its capabilities, so it can never write, and dispatching it in `implement` mode throws before a session starts. The adapter then checks every tool call:

```ts
if (restrictWrites && isWriteTool(toolName, toolInput)) {
  const message =
    'Write operations are restricted in this session. Edits require a dispatch in implement mode.';
  await this.logDeniedTool(toolName, toolInput, message, 'restrictWriteTools');
  return { behavior: 'deny' as const, message };
}
```

`isWriteTool` blocks `Edit`, `MultiEdit`, `Write`, and `NotebookEdit` by name, and Bash commands by regex: `sed -i`, `tee`, `>>`, `rm`, `mv`, `cp`, `git commit`, and similar. The regex list is a heuristic. `printf x > file` gets through. It stops accidental edits, not an adversarial model.

Verify mode is not write-restricted. Its prompt says not to modify code and requires a final `VERIFY_STATUS: pass|fail|unavailable` line, which the harness parses.

## One team per CTO session

Each engineer record persists its Claude session ID, busy flag and `busySince`, last mode, last task summary, a short assignment history, and a context snapshot. A follow-up dispatch to the same engineer resumes the same Claude session.

My first version got team ownership wrong. On 26 March at 02:10 I shipped a persisted "active team" for the worktree, so a new CTO session would adopt the previous team. Seventeen hours later I replaced it. A worktree-global team is shared state: two CTO sessions in one repo would hand out the same engineers and the same Claude sessions.

Now the CTO session ID is the team ID. `test/cto-active-team.test.ts` pins both halves: the same session ID recovers its team after a simulated process restart, and a different session ID gets an independent team.

Two details keep that state usable. Writes to a team file go through a per-team promise queue and land with a temp-file-plus-`rename`, so concurrent updates from parallel engineers do not clobber each other and a crash cannot leave half a JSON file. And busy is a lease, not a lock:

```ts
const leaseExpired =
  engineer.busySince !== null &&
  Date.now() - new Date(engineer.busySince).getTime() > BUSY_LEASE_MS; // 15 min

if (!leaseExpired) {
  throw new Error(`${engineerName} is already working on another assignment.`);
}
```

If the process dies mid-assignment, the engineer frees itself after 15 minutes. `reset_engineer` clears it immediately and can also drop the Claude session or the history.

## Context pressure: estimate, warn, reset only on failure

`ContextTracker` estimates how full each session is with a three-tier fallback:

| Tier | Signal available | Estimate |
| --- | --- | --- |
| 1 | latest input tokens | tokens / window (default 200k) |
| 2 | total cost only | cost × 130,000 tokens |
| 3 | turn count only | turns × 6,000 tokens |

Warnings start at 50% (`moderate`), 70% (`high`), and 85% (`critical`). An input-token drop of more than half between results counts as a probable compaction.

The CTO prompt treats warnings as information and says not to reset on them, because a reset throws away the context that makes a persistent engineer worth reusing. A reset happens only on a real context-exhausted error: the orchestrator clears the session, retries once, and injects condensed history into the fresh session. That history is the last 12 entries (6 assignment/result pairs), with each assignment section and each result trimmed to a few hundred characters. It is not an LLM summary.

## Parallel planning, one writer

`plan_with_team` runs two engineers on the same request with `Promise.all`, both in explore mode. The lead proposes the most direct plan. The challenger stress-tests it and proposes an alternative. A third Claude run with writes denied and no persisted session synthesizes the two drafts into one plan, plus an optional question for the user. The drafts do not land in the engineers' history, because they are inputs, not deliverables.

Parallelism stops at the worktree. On day two I deleted a worktree coordinator that could give each run its own git worktree, and moved everything to one shared working directory. The rule now is that only one implementing engineer touches the worktree at a time. That rule lives in the CTO prompt. The busy lease stops one engineer from being double-booked, but nothing in code stops the CTO from sending Tom and Maya to implement at once.

## What I removed: wrappers, the architect, and the `claude` tool

From 25 March to 16 April, every engineer had two layers. The CTO called OpenCode's `task()` to start a wrapper subagent named Tom, which ran on its own model and called a `claude` bridge tool, which drove the Claude Code session. Planning went through a third wrapper, the architect (renamed `team-planner` the same day), whose job was to call `plan_with_team` so its progress showed in the OpenCode UI.

That meant two model hops per assignment. The wrapper re-wrote the CTO's assignment before Claude saw it, and undo had to rewind both the wrapper session and the Claude session.

On 16 April I added `dispatch_engineer`, which takes `goal`, `mode`, and optional `context`, `deliverable`, `constraints`, `verification`, and `references`, and renders them as labeled sections straight into the Claude prompt. The CTO stopped routing engineers through wrappers that day. On 17 April I removed the remaining wrapper agents (planner, BrowserQA, reviewer) and the `claude` tool; that commit alone deleted 457 lines. `plan_with_team` became a CTO tool that streams the lead, challenger, and synthesis events as tool metadata, which covered the UI reason the architect existed for.

## Review and verify are separate signals

A successful `implement` dispatch raises `reviewPending` and `verifyPending` on that engineer. A verify run clears `verifyPending` only if its last `VERIFY_STATUS` line says `pass`. A `run_code_review` clears `reviewPending` for the team. `git_commit` reports outstanding flags but still commits. The flags are advisory: they make skipped steps visible in `team_status` and on commit without blocking the CTO.

`run_code_review` saves the diff to `.claude-manager/reviews/`, reads the changed paths, and infers review angles when the CTO gives no focus: `public-api`, `state-persistence`, `approval-security`, `prompts`, `plugin-wiring`, `undo-history`, `ui-accessibility`, `build-config`, `test-only`, `docs-only`. A UI change that is not test-only or docs-only sets `browserQaFollowupSuggested`.

The reviewer changed six times in nine days. On 17 April it started as a wrapper agent and became a CTO tool driving a Claude session the same morning. On 23 April I moved it from Claude sessions to an OpenCode agent on a GPT model. Then I made it persistent, then made it fork the CTO conversation, then made it inherit the CTO's model. On 26 April I removed the fork. Every review now starts in a fresh standalone session that sees only the diff artifact and the repo, not the CTO's reasoning.

## Undo reaches the engineers

When the user undoes a CTO message in OpenCode, the engineers' work after that point should also be undone. The plugin watches `session.updated` for a revert marker, fetches the reverted message's timestamp, and counts each engineer's assignments after it:

```ts
const undoCount = engineerRecord.wrapperHistory.filter(
  (h) => h.type === 'assignment' && h.timestamp > cutoffIso,
).length;
```

It sends `/undo` to that engineer's Claude session `undoCount` times, then prunes the history after the cutoff. If an inner undo fails, the engineer's session is cleared so the next assignment starts clean instead of resuming an inconsistent conversation. Revert markers are deduplicated, since OpenCode emits several `session.updated` events per revert, and a team found on disk still gets undo after a restart. `test/undo-propagation.test.ts` has 19 cases.

## Approval policy and `/reflect`

Every engineer session runs under a deny-list policy with `defaultAction: 'allow'`. Default rules block `rm -rf /`, `git push --force`, and `git reset --hard` from inside Claude Code. The destructive reset the user may actually want lives in the CTO's `git_reset` tool.

Each decision is logged (the newest 500, in memory). `approval_decisions` returns a `denialSummary` that groups denies by tool and matched rule with counts and a sample input, and `team_status` includes it when there are any.

`/reflect` uses that summary. It asks every engineer used in the current CTO session, in parallel and in explore mode, what in their instructions pushed them the wrong way. The CTO adds its own reflection, checks the denial patterns for over-restrictive rules, and merges the suggestions. The output is advisory. Nothing edits prompts automatically.

## Tradeoffs I still carry

- **Single writer is a prompt rule.** Code enforces it per engineer, not across engineers.
- **Bash write detection is a regex list.** Good enough for explore mode, not a sandbox.
- **Context numbers are estimates.** Tiers 2 and 3 are rough. They drive warnings and planner selection order, never resets.
- **The approval decision log is in memory.** The policy persists across restarts. The decisions do not.
- **`git_reset` runs `git reset --hard HEAD && git clean -fd`.** It is CTO-only, but it has no confirmation step.

Checking what the engineers changed is its own problem. I wrote about that in [the verification loop for AI coding agents]({% post_url 2026-03-30-the-verification-loop-that-actually-scales %}).

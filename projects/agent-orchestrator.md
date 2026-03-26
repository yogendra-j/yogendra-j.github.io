---
layout: page
title: "Agent Orchestrator for OpenCode"
description: "Engineering a persistent, permission-bounded multi-agent system for Claude Code — with enforced mode separation, parallel planning, and context pressure tracking."
permalink: /projects/agent-orchestrator/
---

An OpenCode plugin that turns a single Claude Code session into a structured engineering org: a CTO agent that owns decomposition and final judgment, named engineer agents with persistent state, an architect that synthesizes competing plans, and permission boundaries enforced in code — not just in prompts.

**GitHub:** [yogendra-j/claude-code-opencode](https://github.com/yogendra-j/claude-code-opencode) &nbsp;·&nbsp; **Stack:** TypeScript, JavaScript, Claude Agent SDK, OpenCode plugin API

---

## The problem

Most multi-agent demos hold together for the first few interactions, then fall apart. The failure modes are predictable: no persistent identity, no real ownership over decisions, every agent doing a little of everything, and exploration mixed with mutation in a single pass.

The gap between a demo and a usable tool is almost never about adding more agents. It's about the unglamorous engineering underneath — state management, permission surfaces, context pressure, recovery paths. That's what this project is about.

## What I built

A structured orchestration layer plugged into OpenCode as a first-class plugin:

```
User → CTO → engineer agents → architect → verification
```

### Persistent agent state

Each engineer wrapper tracks its session ID, busy state, work mode, last task summary, and context usage — and it survives restarts. The active CTO team is persisted so a new CTO session adopts the existing team instead of silently abandoning it. `TeamStateStore` uses queued writes and atomic rename to avoid state corruption under concurrent updates.

Most stateless agent setups push the cognitive load back onto the user: every session begins with re-explaining the context, re-establishing the plan. Persistent identity removes that tax.

### Enforced mode separation

The `claude` bridge tool runs in three modes: `explore`, `implement`, `verify`. In `explore` mode, the SDK adapter denies write tools and destructive shell patterns at the tool layer:

```typescript
if (mode === 'explore' && isWriteTool(toolName, toolInput)) {
  return {
    behavior: 'deny',
    message: 'Write operations are restricted in explore mode.',
  };
}
```

Prompting an agent to "only investigate" is polite. Enforcing it in the tool layer is engineering.

### Parallel planning, serial mutation

`plan_with_team` fans out to two engineers — a lead and a challenger — exploring from different angles concurrently, then routes both drafts to the architect for synthesis before any code changes happen. Only one engineer modifies the worktree at a time.

Parallelism is most valuable where it's safe: competing investigation and plan synthesis. It's actively harmful when two agents race to edit files built on incompatible assumptions.

### Context pressure tracking

The `ContextTracker` estimates session saturation using a fallback ladder: token counts when available, cost-based estimation when not, turns-based as a last resort. It assigns warning levels (`moderate`, `high`, `critical`) and detects probable compaction events. Context limits are treated as a systems problem — visible before they degrade quality, not discovered after.

### Permission surfaces, not prompt rules

The CTO gets delegation, git, and approval controls. Engineers access the `claude` bridge only. The architect is read-only and synthesis-only. A deny-list blocks clearly dangerous operations: `rm -rf /`, `git push --force`, `git reset --hard`.

If a role shouldn't have git management access, the right move is to make those tools unavailable — not to add another paragraph to the system prompt.

## What it demonstrates

This is production-oriented engineering applied to a domain where most implementations stop at "it works in the demo." The interesting decisions aren't about agent count. They're about control flow: ownership, continuity, enforced boundaries, and graceful degradation under pressure.

The plugin is a concrete example of applied AI engineering where the value comes from treating LLM sessions like systems components — with the same attention to state, failure modes, and recovery that any reliable backend service requires.

---

For a full teardown of the design decisions and the specific tradeoffs, read the companion post: [Building a Real Agent Orchestrator for OpenCode →](/posts/Building-an-Agent-Orchestrator-for-OpenCode/)

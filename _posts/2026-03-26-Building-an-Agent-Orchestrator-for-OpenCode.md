---
title: Building a Real Agent Orchestrator for OpenCode
date: 2026-03-26 00:00:00 +0530
categories: [ai, developer-tools]
tags: [opencode, claude, agents, orchestration, typescript]
description: Lessons from `claude-opencode-subagents` on building persistent agents, safe delegation, and orchestration that holds up beyond demos.
pin: true
---

Most agent orchestration demos look smart for five minutes and flaky for the next fifty.

The failure mode is usually boring. No ownership. No memory. No safety boundary. Every agent can do a little of everything, which means no agent is truly accountable for anything.

I spent some time reading through `claude-opencode-subagents`, an OpenCode plugin that orchestrates Claude Code sessions. What makes it interesting is not that it adds more agents. Plenty of projects do that. What makes it good is that it adds the constraints a real engineering workflow needs.

That is the difference between a toy and a tool.

## The shape of the system

At a high level, the plugin creates a small engineering org inside OpenCode:

```text
User -> CTO -> named engineers -> architect -> verification
```

The roles are clear:

- the `cto` agent owns decomposition, delegation, review, and final judgment
- `Tom`, `John`, `Maya`, `Sara`, and `Alex` are persistent engineer wrappers
- the `architect` does not implement; it synthesizes competing plans into one stronger plan

That role split is more important than it looks.

Most multi-agent systems fail because every agent is a generalist with slightly different wording. This plugin does the opposite. It gives each role a narrow job and then backs that job with code-level permissions, persisted state, and explicit operating modes.

## What the plugin gets right

### 1. It treats identity as state, not as prompt flavor

The plugin does not pretend that naming an agent `Tom` magically creates continuity. It persists the actual state that makes continuity useful:

- wrapper session ID
- Claude session ID
- busy flag and lease timing
- last task summary and work mode
- wrapper memory
- context usage snapshot

That state lives under `.claude-manager/`, and it survives restarts.

This matters a lot. Stateless agent setups always sound clean in theory, but they push cognitive load back onto the user. Every new session starts with a small tax: re-explain the problem, re-establish the context, re-decide the plan. A persistent engineer is valuable because the system remembers enough to avoid paying that tax over and over.

One detail I especially liked: the active CTO team is persisted, and a new CTO session adopts the old team instead of silently orphaning it. There is even a test for that edge case. That is the kind of thing people skip in demos and regret in real use.

### 2. It separates exploration from implementation in code, not just in prose

The `claude` bridge tool runs work in three modes:

- `explore`
- `implement`
- `verify`

That sounds small. It is not.

The most common orchestration mistake is asking one session to investigate, modify code, and certify correctness in a single pass. That tends to produce shallow reasoning, premature edits, and fake confidence.

Here, `explore` is explicitly read-only. The SDK adapter enforces that by denying write tools and destructive shell patterns during investigation:

```ts
if (restrictWrites && isWriteTool(toolName, toolInput)) {
  return {
    behavior: 'deny',
    message:
      'Write operations are restricted in explore mode. Ask the CTO to re-dispatch in implement mode for edits.',
  };
}
```

That is exactly the right instinct.

Prompting an agent to "please only investigate" is polite. Enforcing it in the tool layer is engineering.

### 3. It parallelizes disagreement, not mutation

The best part of the plugin is `plan_with_team`.

Instead of asking one agent to think harder, it asks two engineers to explore in parallel from different angles, then sends both drafts to the architect for synthesis. One engineer plays lead. The other acts as challenger.

Under the hood, that happens with a clean `Promise.all` fan-out in `TeamOrchestrator.planWithTeam()`, followed by a dedicated synthesis pass. Conceptually, it looks like this:

```ts
const [leadDraft, challengerDraft] = await Promise.all([
  dispatchEngineer(/* lead */),
  dispatchEngineer(/* challenger */),
]);
```

This is a strong pattern for real engineering work.

- parallelize investigation freely
- let plans disagree early
- synthesize before touching the worktree
- keep code changes serial when safety matters

The plugin's own prompts say only one implementing engineer should modify the worktree at a time. That is not a limitation. That is maturity.

Multiple agents editing the same codebase in parallel sounds efficient right up until you need to reconcile two half-correct changes built on incompatible assumptions.

### 4. It treats context window pressure like a systems problem

Most agent tooling treats context limits as an annoying surprise. Everything looks fine until a session gets bloated, starts drifting, or quietly forgets something important.

`claude-opencode-subagents` handles that better than most. The `ContextTracker` keeps a running estimate of session pressure using a simple fallback ladder:

- token-based when input token counts are available
- cost-based when token counts are missing
- turns-based when that is all you have

It also assigns warning levels like `moderate`, `high`, and `critical`, and it detects likely compaction events when token usage suddenly drops.

That heuristic will never be perfect, but perfection is not the point. The point is to make context saturation visible before it becomes a quality problem.

This is one of those design choices that reads almost boringly practical in code and turns out to be exactly what keeps a long-lived system usable.

### 5. It puts real permission boundaries between roles

The agent hierarchy in `src/plugin/agent-hierarchy.ts` is one of the strongest parts of the design.

The CTO gets inspection, delegation, git, and approval controls. Engineers do not get broad repo powers directly; they only get the `claude` bridge into their Claude Code session. The architect is read-only and synthesis-only.

That means the plugin is not relying on a system prompt to keep roles honest. It uses actual permission surfaces.

That distinction matters.

If an engineer should not be doing git management or policy updates, do not merely tell it not to. Make those tools unavailable.

The same pattern shows up in tool approval. The `ToolApprovalManager` uses a deny-list model with explicit rules for dangerous cases like:

- `rm -rf /`
- `git push --force`
- `git reset --hard`

I like this because it is opinionated without being paralyzing. The default is not blanket fear. The default is usable, with explicit blocks around the operations that can really hurt you.

### 6. It sweats the boring persistence details

This repository has several small implementation decisions that tell me the author has felt real pain before.

`TeamStateStore` does queued writes per team key and persists via atomic rename. That avoids clobbering state when multiple updates race.

`TranscriptStore` strips trailing partial messages before saving transcripts. That keeps persisted history clean instead of filling it with streaming noise.

Wrapper memory is summarized and capped instead of growing forever. Busy engineers use a lease rather than a permanent lock. There is a reset path for recovery when a session gets stuck.

None of that is glamorous. All of it is the difference between something that works on a happy path and something that survives normal messiness.

## The practical lessons I would steal

If I were building my own orchestrator plugin tomorrow, these are the patterns I would copy first.

### Keep one agent accountable

Somebody has to own decomposition, tradeoffs, and the final call. In this design, that is the CTO. That gives the system a center of gravity.

### Persist roles, not just transcripts

A raw transcript is not enough. What you actually need is working memory with structure: who this engineer is, what they last did, what session they own, how full their context is, and whether they are safe to reuse.

### Enforce mode boundaries in the tool layer

If exploration must be read-only, enforce read-only. If verification must produce evidence, make that explicit. Good orchestration is not just better prompting; it is better control flow.

### Use parallelism for planning first

The highest-value place to spend extra agent budget is often before code changes begin. Two competing plans are usually more useful than two agents racing to edit files.

### Treat recovery as a feature

Stuck sessions, bloated context, abandoned teams, and half-finished work are not edge cases. They are normal operating conditions. Design for inspection and reset from the beginning.

### Keep git power near the coordinator

This plugin keeps git review and commit actions at the manager layer. That is a smart trust boundary. Mutation happens through an engineer. Final repo operations stay near the agent that owns the outcome.

## Where I would still be careful

Good engineering writing should not sound like a product page, so here is the honest part.

I like the design, but a few edges are worth watching:

- `git_reset` is manager-only, but it is still a sharp tool; in some environments I would want extra confirmation around it
- context tracking is heuristic-based, which is fine for warnings but not strong enough for hard admission control
- the deny-list approval model stays flexible, but it also means policy quality depends on maintaining good explicit rules
- single-writer mutation is the right default for safety, though it naturally trades off some raw throughput

None of these are fatal flaws. They are simply the kinds of tradeoffs real tools carry.

## What a good tech article should do

Since this post started from reading somebody else's code, it is worth saying the quiet part directly: a good tech article should not just call something "clever" and move on.

It should do three things:

- explain the real problem the design is solving
- show the mechanism, not just the outcome
- be honest about tradeoffs, failure modes, and why the chosen path is reasonable

That is what separates engineering writing from AI-flavored summarization.

The interesting thing about `claude-opencode-subagents` is not that it uses many agents. It is that it understands the unglamorous parts of orchestration: ownership, continuity, permission boundaries, recovery, and review.

That is where serious tooling lives.

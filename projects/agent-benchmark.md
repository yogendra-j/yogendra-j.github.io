---
layout: page
title: "Coding Agent Benchmark on Real Shipped Features"
description: "A private benchmark that replays shipped PRs through a product-owner loop to compare coding agents on completeness, feedback recovery, cost, and time."
permalink: /projects/agent-benchmark/
---

Which coding agent should a team use for feature work in a large production codebase? This benchmark answers that by replaying features that already shipped, so the correct result is known.

**Scope:** 11 tasks, 5 agent and model lanes, one private client codebase (task details stay private) &nbsp;·&nbsp; **Stack:** Bash, Python, git, Postgres, headless agent CLIs

## Why not a public benchmark

Public benchmarks mostly score isolated fixes against hidden tests. Product work is a vague request, questions back, a spec, a change across server and client, then review comments. An agent can do well on the first and still drop half a feature on the second.

## Setup

```text
real merged PR
      |
      v
copy of the repo  ->  revert the PR (or check out its parent commit)
      |                delete git history, re-init one baseline commit
      |                private database per run, repo's AGENTS.md only
      v
round 1  terse feature request    ->  agent asks clarifying questions
round 2  product-owner answers    ->  agent writes SPEC.md
round 3  "implement the spec"     ->  agent builds feature and tests
round 4  reviewer feedback        ->  agent fixes gaps
      |
      v
compare with the real PR diff, run the agent's tests on its copy
log cost, tokens, turns, and wall-clock time per round
```

Four tasks started from a detailed prompt instead of rounds 1 and 2. The other seven ran the full loop.

Design decisions:

- **Revert, then erase history.** With a single-commit repo, the agent cannot `git log` its way to the answer.
- **Phases enforced in the system prompt.** No files while asking questions, no code while writing the spec. Question and spec quality can then be judged separately.
- **Same context for every lane.** Only the repository's own conventions file. No personal skills, memory, or rubrics.
- **One copy and one database per run**, so parallel runs cannot interfere.
- **One runner script** drives every CLI headless, captures the diff against the baseline, and appends metrics to a ledger.

## Scoring

| Signal | How |
| --- | --- |
| Completeness | Every layer of the real PR built, client included |
| Correctness | The agent's server tests, run on its copy |
| Loops to green | Feedback rounds until complete with passing tests |
| Cost and time | CLI-reported cost and wall-clock, summed over rounds |

The three largest tasks (real PRs of roughly 80 to 130 files) produced the ranking:

| Lane | Complete | Cost, 3 tasks | Wall-clock |
| --- | --- | --- | --- |
| Claude Code, Opus (medium effort) | 3 of 3 | $73.52 | 143 min |
| Claude Code, Sonnet | 3 of 3 | $35.04 | 145 min |
| Pi, GPT-5.5 (medium effort) | 3 of 3 | $21.84 | 72 min |
| Pi, GLM-5.2 | 1 of 3 | $16.03 | 95 min |

A fifth lane, GLM-5.2 in Claude Code, hit provider usage caps on two of the three and is left out.

## What I learned

1. **Small tasks do not separate agents.** On the eight smaller tasks, every lane that ran them converged in about one feedback round. Only large, multi-concern features produced a ranking.
2. **The common failure is under-scoping, not broken code.** One lane wrote hundreds of passing server tests and no UI, and skipped the client again after feedback asking for it. A green suite says nothing about a missing layer.
3. **Measure cost per complete feature, not per run.** The cheapest lane was cheap because it shipped less. Among lanes that finished everything, cost varied about 3.4x, and the cheapest was also the fastest.
4. **The harness changes the result.** On the one task both GLM lanes finished, Claude Code built the full client on the first pass. Pi built it only after feedback.
5. **Recovery matters as much as the first pass.** One lane shipped a missing sub-feature on one task and a non-compiling server on another, then fixed both in one round each. Loops to green tell you more than a first-pass score.

## Limitations

- Small sample. One codebase, 11 tasks, one counted run per lane per task. Three tasks decided the ranking.
- Model and harness are confounded. Only GLM ran in two harnesses.
- The product owner knew the answer. Answers and feedback were written from the real PR, so their quality is a variable.
- Cost is CLI-reported, not invoiced, which matters most for subscription-backed providers.
- Test counts are not comparable across agents, so tests act as a gate, not a score.
- Provider limits shaped the schedule. Rate limits and caps meant lanes finished at different times.

---
layout: page
title: "Enterprise AI workflow platform"
description: "Case study: building the workflow engine, queues, schedules, human approvals, and LLM provider migrations for an enterprise AI automation platform."
permalink: /projects/ai-workflow-platform/
---

Client work through Incubyte, late 2024 to now. The product lets enterprise teams build AI agents and multi-step workflows that call models, tools, files, and external APIs. Client and product details are left out on purpose.

I'm one of the core engineers, working full stack in TypeScript. I mostly owned the workflow runtime and the infrastructure around it.

Stack: NestJS, PostgreSQL with Prisma, Redis and BullMQ, Next.js and React, several LLM provider APIs.

## What I worked on

Workflow engine
: Config-driven execution with branching, loops, optional and repeated inputs, and reusable published sub-flows. The hard part: keeping run state correct when steps nest, fail halfway, or get retried.

Triggers
: Hourly and cron schedules, plus webhook and event triggers behind a Redis-backed queue. The hard part: throughput limits that hold across every instance, not just one process.

Human in the loop
: Approval steps that pause a run, including inside nested loops, then resume or reject. The hard part: modelling partial approval without losing the rest of the run.

LLM layer
: Migration from one provider API generation to the next, provider routing, file search with citations, image generation, speech input. The hard part: tools, files, and loops behaving the same after the switch.

Browser agents
: LLM-driven browser automation with reusable skills, and generated code running in an isolated worker. The hard part: speed and safety at the same time.

Code health
: A ports-and-adapters module layout with in-memory test doubles and HTTP-level end-to-end tests. The hard part: changing structure while features keep shipping.

## Decisions worth explaining

### Rate limits are global

A per-instance limiter looks right in development and lets through N times the traffic once the service scales out. Webhook and trigger work goes through a shared Redis queue so the limit is global. In Redis Cluster, keys used together in one operation need the same hash tag, or the call fails with `CROSSSLOT`.

### A provider migration is a behavior migration

Moving to a new model API meant keeping tool calls, file handling, and loop behavior identical across both APIs while flows kept running.

### Generated code runs somewhere else

In-process sandboxes such as Node's `vm` module are not a security boundary. Code the model writes runs in a separate worker, so a bad script can only fail its own job.

## What I took away

- Many "AI bugs" turned out to be ordinary distributed-systems bugs: retries, duplicate events, and state with two writers.
- Tests against in-memory ports made large refactors cheap enough to actually do.
- The product UI is part of reliability. If users can't see why a run paused or failed, they can't trust it.

Related writing: [idempotent APIs]({% post_url 2026-03-21-Designing-Idempotent-APIs-for-Reliable-Backends %}), [Redis patterns]({% post_url 2026-03-21-Redis-Caching-Patterns-I-Actually-Use %}), and [verifying agent changes]({% post_url 2026-03-30-the-verification-loop-that-actually-scales %}).

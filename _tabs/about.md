---
# the default layout is 'page'
title: About
description: Yogendra Jaiswal is a software engineer at Incubyte and ex-Amazon SDE who builds AI workflow platforms, backend systems, and agent tooling in TypeScript.
image: /assets/img/profile.jpg
icon: fas fa-info-circle
order: 3
---

I'm a software engineer at [Incubyte](https://incubyte.co), with about five years in industry. I started at Amazon as an SDE. For the last two years I've been a core engineer on an enterprise AI automation platform, where I work across the workflow engine, its queues and schedulers, LLM integrations, and the product UI on top.

I trained as a civil engineer (B.Tech, IIT Gandhinagar) and a structural engineer (M.Tech, IIT Guwahati) before moving to software. The habit that carried over is asking how a thing fails before asking how it works.

## What I'm good at

Backend systems
: NestJS, PostgreSQL, Prisma, Redis and BullMQ. Queues, retries, idempotency, rate limits across instances, schema migrations.

Applied AI
: Agent and tool orchestration, provider API migrations, file search and citations, browser agents, evaluating coding agents on real work.

Product engineering
: React and Next.js for the screens that make a complex backend usable: flow editors, run history, analytics.

Engineering practice
: Test-first bug fixes, modules with in-memory test doubles, design docs before contested changes. I also interview engineering candidates at Incubyte.


## How I work

A change is done when I have seen it work on the running system. Passing tests are where that check starts.

If an agent or a service must never do something, I make the tool or the type refuse it, rather than writing it down as a rule.

## Start here

- [Designing idempotent APIs]({% post_url 2026-03-21-Designing-Idempotent-APIs-for-Reliable-Backends %}): retries, lost responses, and what you need to store.
- [MySQL vs PostgreSQL isolation levels]({% post_url 2024-05-26- Database Isolation Levels: MySQL vs PgSQL %}): what concurrent transactions see, shown in two terminals.
- [The verification loop for AI coding agents]({% post_url 2026-03-30-the-verification-loop-that-actually-scales %}): how I check agent changes faster than they arrive.

## Contact

[Email](mailto:yogendra.jaiswal.503@gmail.com) is best. I'm also on [LinkedIn](https://www.linkedin.com/in/yogendra-jaiswal/) and [GitHub](https://github.com/yogendra-j).

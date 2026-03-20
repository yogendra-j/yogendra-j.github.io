---
title: Redis Caching Patterns I Actually Use in Backend Services
date: 2026-03-21 00:00:00 +0530
categories: [backend, caching]
tags: [redis, caching, performance, backend, system-design]
description: A practical overview of Redis caching patterns, cache invalidation tradeoffs, and when not to cache.
pin: true
---

Caching discussions often stay too abstract. In practice, I keep coming back to a small set of patterns depending on the failure mode I care about.

## 1. Cache-aside for read-heavy data

This is the default pattern for many APIs.

1. Read from cache.
2. On miss, read from the database.
3. Write the result back to cache with a TTL.

It is simple and gives you control over what gets cached. It also makes stale data behavior easy to reason about.

Good fits:

- profile or settings lookups
- read-heavy dashboard data
- expensive aggregate queries

## 2. Write-through when consistency matters more than write cost

When an update happens, write to the primary store and cache in the same flow.

This reduces stale reads immediately after writes, but increases write-path complexity. I only use it when the read path is hot enough and stale reads are costly.

## 3. Short TTL plus explicit invalidation

This is the most practical compromise for many product APIs.

- use a TTL to avoid permanent staleness
- explicitly delete or refresh cache entries on important writes

The TTL is the safety net. Invalidation keeps freshness better on the hottest keys.

## 4. Negative caching

If a lookup often misses, caching the miss can be valuable.

Examples:

- user not found
- feature flag config absent
- optional integration not configured

Without negative caching, repeated misses can become their own thundering herd.

## 5. Request coalescing

A hot key expires and fifty requests miss at once. If every request falls through to the database, the cache just moved the spike instead of absorbing it.

This is where a single-flight or lock-based approach helps:

- one worker rebuilds the value
- the rest wait briefly or use stale data

## When I avoid caching

- when the query is already cheap
- when the invalidation story is unclear
- when correctness is more important than latency
- when the dataset changes too frequently for the cache to stay useful

## Cache invalidation rule of thumb

If you cannot describe exactly when a cached value becomes wrong, you are not ready to cache it yet.

## Final thought

Redis is powerful, but caching is not free performance. It is a consistency tradeoff with an operational cost. The best cache is the one with behavior your team can still explain during an incident.

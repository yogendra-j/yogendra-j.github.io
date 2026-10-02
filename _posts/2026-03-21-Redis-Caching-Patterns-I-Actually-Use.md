---
title: "Redis Caching Patterns: Stampedes, Invalidation, and Hot Keys"
date: 2026-03-21 00:00:00 +0530
categories: [backend, caching]
tags: [redis, caching, performance, system-design]
description: Cache-aside with jittered TTLs, delete after commit, one rebuilder per key with stale reads, and spread hot keys. Failure modes and when to skip each.
image:
  path: /assets/img/og/posts/redis-caching.jpg
  alt: "Redis Caching Patterns: Stampedes, Invalidation, and Hot Keys"
---

**TL;DR:** Default to cache-aside with a TTL, and invalidate by deleting the key after the database commit, never before. Protect hot keys from stampedes by letting one caller rebuild while the rest serve the stale value, and add jitter so keys do not expire together. Most caching incidents come from ordering races, synchronized expiry, a single overloaded key, or an eviction policy nobody set.

## 1. Cache-aside is the default

1. Read from Redis.
2. On a miss, read from the database.
3. Write the result back with a TTL.

It fits profile and settings lookups, read-heavy dashboards, and expensive aggregates. The application owns the logic, so a Redis outage degrades to slower reads instead of failed requests, as long as Redis errors are caught and treated as misses.

Most of the bugs live in the write path.

## 2. Invalidate after commit, and delete instead of set

Two choices decide whether your cache serves stale data for a full TTL.

Deleting before the database write is wrong:

| Step | Writer | Reader |
| --- | --- | --- |
| 1 | `DEL product:42` | |
| 2 | | Miss, reads DB, gets the old row (writer not committed yet) |
| 3 | | `SET product:42 old` |
| 4 | `COMMIT` new price | |

The cache now holds the old price until the TTL expires. The window is the whole write transaction, so this happens regularly under load. Deleting *inside* the transaction has the same problem.

Deleting after commit is right, but a smaller race remains:

| Step | Writer | Reader |
| --- | --- | --- |
| 1 | | Miss, reads DB, gets the old row |
| 2 | `COMMIT` new price | |
| 3 | `DEL product:42` | |
| 4 | | `SET product:42 old` |

This needs a reader's DB read to start before the commit and its cache write to land after the delete. That is rare but real, and the TTL is what bounds it. If that bound is too loose, do a second delayed delete a few seconds later, or invalidate from change data capture (CDC: a consumer of the binlog or WAL, such as Debezium), which runs only after commit.

```typescript
// db.transaction is your ORM or driver's transaction helper.
await db.transaction(async (tx) => {
  await tx.query("UPDATE products SET price = $1 WHERE id = $2", [price, id]);
});
await redis.del(`product:${id}`); // after commit, never before or inside
```

Why delete instead of setting the new value? Two concurrent writers can commit to the database in one order and write to Redis in the other. The cache then holds the losing value with no reader miss to correct it. A delete is order-independent: the next read loads whatever committed last.

The same race affects write-through caching, where one code path writes both the database and the cache. The two writes are not atomic, and either can fail alone. Use it only when stale reads right after a write are expensive, and fall back to delete on any error.

## 3. Stampede protection: one rebuilder, everyone else serves stale

A hot key expires and 500 requests miss at once. If they all query the database, the cache has moved the spike instead of absorbing it.

Take a lock per key (`SET lock:key token NX PX`) so one caller rebuilds, and keep the value past its freshness time so callers that lose the lock return the stale copy instead of waiting. That second part is stale-while-revalidate. Add TTL jitter too, or keys written together after a deploy or bulk load will expire together.

```typescript
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

type Entry<T> = { value: T; freshUntil: number };

// Delete the lock only if we still own it. A plain DEL can remove a lock
// that expired and was taken by another caller.
const RELEASE = `if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1]) else return 0 end`;

export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  { freshMs = 60_000, staleMs = 300_000, lockMs = 5_000, attempts = 20 } = {},
): Promise<T> {
  const raw = await redis.get(key);
  const entry = raw ? (JSON.parse(raw) as Entry<T>) : null;
  if (entry && Date.now() < entry.freshUntil) return entry.value;

  const lockKey = `lock:${key}`;
  const token = randomUUID();
  const won = (await redis.set(lockKey, token, "PX", lockMs, "NX")) === "OK";

  if (!won) {
    if (entry) return entry.value; // stale, but someone is already refreshing
    if (attempts <= 1) return load(); // stop waiting rather than hang
    await sleep(50);
    return cached(key, load, { freshMs, staleMs, lockMs, attempts: attempts - 1 });
  }

  try {
    const value = await load();
    const jitter = Math.random() * freshMs * 0.1;
    const next: Entry<T> = { value, freshUntil: Date.now() + freshMs + jitter };
    await redis.set(key, JSON.stringify(next), "PX", freshMs + staleMs);
    return value;
  } finally {
    await redis.eval(RELEASE, 1, lockKey, token);
  }
}
```

Against a local Redis 7.4, 50 concurrent calls on a cold key ran the loader once, and 50 concurrent calls on a stale key also ran it once while the other 49 returned immediately.

Details that matter:

- The lock TTL must exceed the load time. If the load takes longer than `lockMs`, the lock expires, a second caller rebuilds too, and without the token check the first caller would delete the second caller's lock.
- Cold misses still wait. Stale-while-revalidate only helps once a value exists. Pre-warm critical keys on deploy.
- The stale window is a product decision. Five minutes of stale prices may be fine; five minutes of stale permissions is not.
- In-process single-flight deduplicates per instance only, so 40 instances still send 40 loads.

## 4. Negative caching

If lookups for missing data are common (unknown user, unconfigured integration, absent feature flag), cache the miss. The helper above already does this when `load` returns `null`. Two rules:

- Give misses a shorter TTL than hits.
- Delete the key on create, or the new record stays invisible until the miss expires.

Negative caching also limits damage from callers that request random IDs. Without it, every request goes to the database.

## 5. Hot keys

Each key lives on exactly one shard. One very popular key (a global config, a viral product) can saturate one node's CPU or network while the others sit idle. Adding shards does not help.

- Find them with `redis-cli --hotkeys` (it requires an LFU `maxmemory-policy`) or per-key metrics in your client.
- Keep a 1 to 5 second in-process (L1) copy in front of Redis. This removes most of the load and costs a few seconds of staleness per instance.
- Use Redis 6+ client-side caching: with `CLIENT TRACKING`, the server sends invalidation messages to clients holding local copies.
- Replicate the key: write `config#0` through `config#7` and read a random one. Writes cost 8 times as much, and invalidation must cover all copies.

## 6. Redis Cluster: CROSSSLOT and hash tags

In Cluster mode, any command that touches several keys (`MGET`, `MSET`, `DEL` with several keys, `MULTI` transactions, Lua scripts) requires all keys to be in the same hash slot:

```text
> MGET user:42:profile user:42:settings
(error) CROSSSLOT Keys in request don't hash to the same slot

> MGET user:{42}:profile user:{42}:settings
1) (nil)
2) (nil)

> CLUSTER KEYSLOT user:{42}:profile
(integer) 8000
> CLUSTER KEYSLOT user:{42}:settings
(integer) 8000
```

Only the substring inside the first `{...}` is hashed, so both keys land in slot 8000. Code that works on a single local Redis can fail like this in production, so test against a cluster-mode instance.

Tag by the entity that is accessed together (`{42}` for one user). A broad tag such as `{users}` puts every user in one slot, which creates the hot-key problem from section 5 on purpose.

## 7. Memory and eviction

- Set `maxmemory` and a policy. The default policy is `noeviction`: when memory is full, writes fail with an `OOM` error instead of evicting old cache entries. For a pure cache, use `allkeys-lru` or `allkeys-lfu`.
- Keep queues off the cache instance. Job queues such as BullMQ require `noeviction`, because an evicted job key means a lost job. A cache wants eviction. One instance cannot do both safely.
- Version the key when the cached shape changes (`v2:product:42`). Otherwise new code reads old JSON during a rolling deploy.
- Keep values small. Redis runs commands on one thread, so a multi-megabyte value slows every other client on that node.

## When not to cache

- The query is already fast with an index.
- You cannot say exactly which writes make the value wrong.
- The caller needs read-your-writes consistency (balances, permissions right after a change) and a stale read causes harm.
- The data changes more often than it is read, so the hit rate stays low.
- The real problem is a missing index or an N+1 query, and the cache would hide it.

## Takeaways

- [ ] Cache-aside with a TTL. Treat Redis errors as misses.
- [ ] On writes, delete the key after commit. Never delete before the write, and never `SET` the new value from the write path.
- [ ] The TTL is the bound on every race you did not fix. Choose it on purpose.
- [ ] Hot keys get a lock, stale-while-revalidate, and jitter.
- [ ] Release locks with a token check. Lock TTL greater than load time.
- [ ] Negative-cache misses with a short TTL and delete on create.
- [ ] Use hash tags for multi-key operations in Cluster, scoped to one entity.
- [ ] Set `maxmemory` and an eviction policy. Keep queues on a separate `noeviction` instance.

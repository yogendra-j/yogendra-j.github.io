---
title: "Idempotency Keys: Designing APIs That Survive Retries"
date: 2026-03-21 00:00:00 +0530
categories: [backend, system-design]
tags: [api-design, idempotency, retries, postgresql, distributed-systems]
description: Store each key per client with a request hash and the final response. Return 409 for in-flight duplicates, 422 for payload mismatch, and replay the rest.
image:
  path: /assets/img/og/posts/idempotency-keys.jpg
  alt: "Idempotency Keys: Designing APIs That Survive Retries"
---

**TL;DR:** Make the client send an `Idempotency-Key`, and let a unique constraint on `(client_id, key)` decide which request runs. Store a hash of the request and the final response, then replay that response on retries, return `409` while the first request is still running, and return `422` if the same key arrives with a different payload. Commit the side effect and the stored response in one transaction, and pass the key downstream for any side effect outside your database.

Clients retry. Timeouts, dropped connections, load balancer resets, mobile apps resuming, and queue redelivery all produce a second copy of a request that may already have succeeded. Without idempotency, that second copy creates a second payment, order, or job.

Where it matters most:

- Payment and order creation
- Emails, SMS, and notifications
- Background jobs started from user actions
- Webhook consumers (providers deliver at least once)
- Any queue consumer with redelivery on timeout

## The contract

```http
POST /payments HTTP/1.1
Host: api.example.com
Content-Type: application/json
Idempotency-Key: 8d4d7f4b-2d8b-4fa5-b7a4-2d6c7e9b41f0

{"amount": 500, "currency": "INR"}
```

| Situation | Response |
| --- | --- |
| New key | Execute, store the response |
| Same key, same payload, completed | Replay the stored status code and body |
| Same key, same payload, still running | `409 Conflict`, optionally with `Retry-After` |
| Same key, different payload | `422 Unprocessable Content` |
| Key missing on an endpoint that requires it | `400 Bad Request` |
| Key older than the retention window | Treated as a new request |

These status codes follow the IETF [Idempotency-Key header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/). The `422` case matters: replaying the old response for a different payload hides a client bug and returns data that does not match what the caller sent.

## Schema

```sql
CREATE TABLE idempotency_keys (
  client_id       TEXT        NOT NULL,
  idempotency_key TEXT        NOT NULL,
  request_hash    TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('in_progress', 'completed')),
  response_code   INT,
  response_body   JSONB,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (client_id, idempotency_key)
);

CREATE INDEX idempotency_keys_expires_at ON idempotency_keys (expires_at);
```

| Column | Why it exists |
| --- | --- |
| `client_id` in the key | Keys are only unique per caller. A global key lets tenant B receive tenant A's stored response, which is a data leak. |
| `request_hash` | Separates a safe retry from key reuse with a different payload. |
| `status` | Separates "done, replay it" from "running, do not start again". |
| `response_code`, `response_body` | Replay must return the original status code and body. Storing only a `resource_id` means rebuilding the response later, which can differ if the resource has changed since. |
| `locked_until` | Lease, so a key stuck by a crashed worker can be reclaimed. |
| `expires_at` | Retention window, plus an index for the purge job. |

## The handler

Node.js with `pg`. The work runs inside a transaction that also records the response.

```typescript
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

type Result = { code: number; body: unknown };
type Row = {
  request_hash: string;
  status: "in_progress" | "completed";
  response_code: number | null;
  response_body: unknown;
};

// Same payload, same hash, regardless of JSON key order.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export async function withIdempotency(
  db: Pool,
  clientId: string,
  key: string,
  request: { method: string; path: string; body: unknown },
  run: (tx: PoolClient) => Promise<Result>,
): Promise<Result> {
  const hash = createHash("sha256").update(canonical(request)).digest("hex");

  // 1. Claim the key in its own short transaction, so duplicates see it at once.
  const claim = await db.query(
    `INSERT INTO idempotency_keys
       (client_id, idempotency_key, request_hash, status, locked_until, expires_at)
     VALUES ($1, $2, $3, 'in_progress', now() + interval '30 seconds', now() + interval '24 hours')
     ON CONFLICT (client_id, idempotency_key) DO NOTHING`,
    [clientId, key, hash],
  );

  if (claim.rowCount === 0) {
    const { rows: [row] } = await db.query<Row>(
      `SELECT request_hash, status, response_code, response_body
         FROM idempotency_keys WHERE client_id = $1 AND idempotency_key = $2`,
      [clientId, key],
    );
    if (!row) throw new Error("idempotency key released concurrently; retry");
    if (row.request_hash !== hash) return { code: 422, body: { error: "key reused with a different request" } };
    if (row.status === "in_progress") return { code: 409, body: { error: "request with this key is in progress" } };
    return { code: row.response_code!, body: row.response_body }; // replay
  }

  // 2. Do the work and record the response in ONE transaction.
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const result = await run(tx);
    await tx.query(
      `UPDATE idempotency_keys
          SET status = 'completed', response_code = $3, response_body = $4, locked_until = NULL
        WHERE client_id = $1 AND idempotency_key = $2`,
      [clientId, key, result.code, JSON.stringify(result.body)],
    );
    await tx.query("COMMIT");
    return result;
  } catch (err) {
    await tx.query("ROLLBACK");
    // Nothing was committed, so free the key and let the client retry.
    await db.query(
      `DELETE FROM idempotency_keys WHERE client_id = $1 AND idempotency_key = $2`,
      [clientId, key],
    );
    throw err;
  } finally {
    tx.release();
  }
}
```

Tested against PostgreSQL 18: two concurrent requests with the same key and reordered JSON fields produce one `201`, one `409`, and exactly one payment row. A later retry replays the `201` body, and a different payload under the same key gets `422`.

## Failure modes, and how the design handles them

### Two requests with the same key, at the same time

The check-then-insert approach (`SELECT`, and `INSERT` if absent) races: both requests see no row and both execute. The primary key arbitrates instead. Only one `INSERT ... ON CONFLICT DO NOTHING` inserts a row, and the other gets zero rows back.

Committing the claim separately means the loser sees `in_progress` immediately and returns `409`. The alternative is to claim inside the work transaction. Then the second request blocks on the unique index until the first commits, and afterwards reads the completed row and replays it. That gives simpler client behavior, but it holds a connection and a row lock for the full request duration, which hurts with slow handlers.

### The commit succeeded but the response was lost

This is the most common case. The retry finds a `completed` row with the same hash and replays the stored response. The client cannot tell the difference, which is the point.

### The process crashed mid-request

Because the work and the `completed` update share a transaction, a crash rolls both back. The key stays `in_progress` with an expired lease. Let a retry reclaim it:

```sql
UPDATE idempotency_keys
   SET locked_until = now() + interval '30 seconds'
 WHERE client_id = 'acme'
   AND idempotency_key = '8d4d7f4b-2d8b-4fa5-b7a4-2d6c7e9b41f0'
   AND request_hash = 'f3a9c1d2'
   AND status = 'in_progress'
   AND locked_until < now()
RETURNING idempotency_key;
```

One row back means you own the key again and can run the work. Set the lease longer than your request timeout, or a slow but live request gets reclaimed and runs twice.

### The side effect is outside your database

You cannot put a card charge or an email in a Postgres transaction. If the process dies after the charge and before the commit, the retry charges again.

Forward a derived key such as `clientId:key` to the downstream API. Most payment providers accept one. If the downstream has no idempotency support, write an outbox row in the same transaction and let a worker deliver it with its own dedupe. For low-stakes effects you can accept at-least-once delivery, as long as the API docs say so.

### Errors: what to store

Store deterministic outcomes: success, validation errors, and business rule rejections such as "insufficient funds". Replaying those is correct. Do not store transient failures (timeouts, `503`, deadlocks). Throw them, release the key, and let the client retry. Caching a `500` turns one bad second into a failure that lasts the whole retention window.

### Retention window

Keep keys longer than the longest realistic retry window, including client backoff, queue redelivery, and offline mobile clients. Stripe documents a 24-hour window. A retry after expiry executes again, so state the window in the API contract. Purge with a scheduled `DELETE ... WHERE expires_at < now()`.

### The client generates a new key per attempt

This is the most common integration bug. The key must be created once per logical operation and reused on every retry of it. A UUID generated inside the retry loop makes every attempt look new.

## Can I use Redis for this?

`SET idem:<client>:<key> <hash> NX EX 86400` is fast and handles the in-flight check well. But Redis is not in your database transaction, and a failover or memory eviction can drop the key. Redis works as a fast first filter in front of a database unique constraint. It should not be the only guard for money.

## Webhooks and queue consumers

The same pattern applies on the receiving side. The key is the provider's event ID or the message ID:

```sql
CREATE TABLE processed_events (
  source     TEXT        NOT NULL,
  event_id   TEXT        NOT NULL,
  handled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, event_id)
);
```

Insert into `processed_events` in the same transaction as the effect. A redelivered event hits the primary key and is acknowledged without doing the work again. Acknowledge only after commit, or a crash between the acknowledgment and the commit loses the event.

## Takeaways

- Scope keys by `(client_id, key)`. Never use a global key.
- Let a unique constraint decide which request runs. Check-then-insert races.
- Return `409` while the first request is running, `422` on fingerprint mismatch, and replay otherwise.
- Store the status code and body for replay.
- Commit the side effect and the stored response together. Forward the key to anything outside the transaction.
- Do not store transient failures. Release the key.
- Use a lease longer than the request timeout, and a retention window longer than the retry window.
- Clients generate the key once per operation and reuse it on every retry.

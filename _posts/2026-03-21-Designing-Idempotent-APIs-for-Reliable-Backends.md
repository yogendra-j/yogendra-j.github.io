---
title: Designing Idempotent APIs for Reliable Backends
date: 2026-03-21 00:00:00 +0530
categories: [backend, system-design]
tags: [api, idempotency, retries, payments, distributed-systems]
description: A practical guide to idempotency keys, request replay safety, and failure handling in backend APIs.
pin: true
---

Idempotency is one of the simplest ideas that prevents some of the ugliest production bugs.

If a client retries a request because of a timeout, network flap, or browser refresh, the backend should not accidentally create the same order, payment, or job twice. That is the core problem idempotent API design solves.

## Where it matters most

- Payment creation
- Order placement
- Email or notification triggers
- Background jobs started from user actions
- Third-party webhook processing

## The basic pattern

The client sends an **idempotency key** with a request that is expected to have side effects.

```http
POST /payments
Idempotency-Key: 8d4d7f4b-2d8b-4fa5-b7a4-2d6c7e9b41f0
```

The server stores:

- the key
- a stable request fingerprint
- the final response or operation status

If the same key comes again with the same request payload, the server returns the earlier result instead of running the operation again.

## What needs to be stored

At minimum:

- `idempotency_key`
- `request_hash`
- `status`
- `response_body` or `resource_id`
- `created_at`
- `expires_at`

This lets you distinguish between:

- a safe retry of the same request
- a client bug reusing a key for a different payload

## Failure modes to think through

### 1. Request succeeded but response was lost

This is the classic case. The database commit happened, but the client timed out. A retry should return the original result.

### 2. Request is still in progress

If the same key arrives while the first request is still being processed, return a clear status such as `409 Conflict` or a polling-friendly response instead of starting duplicate work.

### 3. Same key, different payload

This should be rejected. Reusing the same idempotency key for a different request is almost always a caller bug.

## Database design matters

The cleanest implementation usually includes a unique constraint on the idempotency key:

```sql
CREATE TABLE idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  response_body JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
```

That uniqueness check should be part of the same transactional path as the side effect you want to protect.

## Practical rules I like

- Scope keys per user or tenant if needed
- Hash the important parts of the request payload
- Keep keys long enough for realistic retry windows
- Return the same response shape on replay
- Log reuse, collisions, and payload mismatches

## A useful mental model

Idempotency is not just a payment feature. It is a reliability feature. It makes distributed systems behave better under the exact conditions where users and networks are least reliable.

If an API can be retried, it should be designed with replay safety in mind from the beginning.

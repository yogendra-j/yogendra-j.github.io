---
title: "MySQL vs PostgreSQL Isolation Levels: What Actually Differs"
date: 2024-05-26 00:00:00 +0530
categories: [databases, sql]
tags: [mysql, postgresql, innodb, isolation-levels, transactions, concurrency]
description: InnoDB defaults to Repeatable Read yet allows lost updates. PostgreSQL defaults to Read Committed and aborts them at Repeatable Read. Tested side by side.
image:
  path: /assets/img/og/posts/isolation-levels.jpg
  alt: "MySQL vs PostgreSQL Isolation Levels: What Actually Differs"
---

**TL;DR:** MySQL (InnoDB) defaults to Repeatable Read, PostgreSQL to Read Committed, but the names hide the real difference. At Repeatable Read, InnoDB lets a concurrent write overwrite another committed write without an error, while PostgreSQL aborts the second transaction with a serialization failure. Neither database's Repeatable Read prevents write skew, so invariants that span rows need Serializable, explicit locks, or constraints, plus a retry loop.

Everything below is for InnoDB, not every MySQL storage engine. All three experiments were run against MySQL 8.4 and PostgreSQL 18.

## Defaults, and how to check them

| | MySQL (InnoDB) | PostgreSQL |
| --- | --- | --- |
| Default level | `REPEATABLE READ` | `READ COMMITTED` |
| Snapshot at Read Committed | Fresh snapshot per consistent read | Fresh snapshot per statement |
| Snapshot at Repeatable Read | Taken at the first consistent read, not at `START TRANSACTION` | Taken at the first statement that is not transaction control |
| Read Uncommitted | Real dirty reads | Behaves as Read Committed |
| Serializable mechanism | Locks: with autocommit off, plain `SELECT` becomes `SELECT ... FOR SHARE` | Serializable Snapshot Isolation: no extra locks, aborts on dangerous patterns |

Frameworks and connection pools often override the default, so check the session you actually run on:

```sql
-- MySQL 8.x: current session and server default
SELECT @@SESSION.transaction_isolation, @@GLOBAL.transaction_isolation;
```

```sql
-- PostgreSQL: current transaction and session default
SHOW transaction_isolation;
SHOW default_transaction_isolation;
```

Setting it for one transaction:

```sql
-- MySQL: applies to the next transaction only
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
-- queries
COMMIT;
```

```sql
-- PostgreSQL
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- queries
COMMIT;
```

## What the SQL standard promises

The standard defines levels by which anomalies they forbid. Implementations may be stricter. This table is the standard plus PostgreSQL's documented extras. InnoDB's actual behavior is in the experiments below.

| Level | Dirty read | Non-repeatable read | Phantom read | Serialization anomaly |
| --- | --- | --- | --- | --- |
| Read Uncommitted | Allowed (not in PG) | Possible | Possible | Possible |
| Read Committed | Not possible | Possible | Possible | Possible |
| Repeatable Read | Not possible | Not possible | Allowed (not in PG) | Possible |
| Serializable | Not possible | Not possible | Not possible | Not possible |

The table leaves out the anomaly that causes the most production bugs: the **lost update**. The standard's anomaly list does not cover it, and this is where the two engines diverge.

## Experiment 1: the lost update

Two requests read a balance of 100 and compute a new value in application code. One withdraws 30, the other 50. The correct final balance is 20.

```sql
CREATE TABLE accounts (id INT PRIMARY KEY, balance INT NOT NULL);
INSERT INTO accounts VALUES (1, 100);
```

| Step | Session A | Session B |
| --- | --- | --- |
| 1 | `BEGIN;` then `SELECT balance FROM accounts WHERE id = 1;` returns 100 | |
| 2 | | `BEGIN;` then the same `SELECT` returns 100 |
| 3 | `UPDATE accounts SET balance = 70 WHERE id = 1;` | |
| 4 | | `UPDATE accounts SET balance = 50 WHERE id = 1;` blocks on A's row lock |
| 5 | `COMMIT;` | Unblocks. Outcome depends on the engine. |

| Engine and level | Session B after step 5 | Final balance |
| --- | --- | --- |
| MySQL, Repeatable Read (default) | Update succeeds, commit succeeds | 50 (A's withdrawal is lost) |
| PostgreSQL, Read Committed (default) | Update succeeds, commit succeeds | 50 (lost) |
| PostgreSQL, Repeatable Read | `ERROR: could not serialize access due to concurrent update` | 70, B must retry |

Why InnoDB does this: plain `SELECT` reads the snapshot, but `UPDATE`, `DELETE`, and locking reads always act on the latest committed row (a "current read"). B's snapshot said 100, its write landed on top of A's 70, and nothing complained. PostgreSQL Repeatable Read uses first-updater-wins: if a row changed after your snapshot, your write to it fails.

Fixes, in order of preference:

1. Do the arithmetic in SQL: `UPDATE accounts SET balance = balance - 30 WHERE id = 1;` Both engines evaluate this against the current row, so it is safe at any level.
2. Lock what you read. `SELECT ... FOR UPDATE` serializes the read-modify-write on that row.
3. Add a version column and check it: `UPDATE ... SET balance = 70, version = version + 1 WHERE id = 1 AND version = 7;` and treat zero affected rows as a conflict.
4. Run at PostgreSQL Repeatable Read or Serializable, and retry on failure.

## Experiment 2: InnoDB writes can see rows your reads cannot

```sql
CREATE TABLE jobs (id INT PRIMARY KEY, status VARCHAR(20));
INSERT INTO jobs VALUES (1, 'pending');
```

Session A, at Repeatable Read:

```sql
START TRANSACTION;
SELECT COUNT(*) FROM jobs WHERE status = 'pending';   -- 1
-- Session B now runs (autocommit): INSERT INTO jobs VALUES (2, 'pending');
SELECT COUNT(*) FROM jobs WHERE status = 'pending';   -- still 1: snapshot read
UPDATE jobs SET status = 'claimed' WHERE status = 'pending';  -- MySQL: 2 rows affected
SELECT COUNT(*) FROM jobs WHERE status = 'claimed';   -- MySQL: 2
COMMIT;
```

InnoDB's `UPDATE` claimed a row that both of A's reads said did not exist, and after the update that row became visible to A. PostgreSQL's `UPDATE` uses the transaction snapshot, so it affects 1 row. If your code reads a set, makes a decision, and then writes with a broader `WHERE`, InnoDB can apply that decision to rows it never evaluated. Use the same predicate with `FOR UPDATE` on the read, or write by primary key.

On the locking side, InnoDB Repeatable Read takes next-key (gap) locks on range scans for locking reads and writes. That blocks inserts into the scanned range, which prevents phantoms for those statements but also causes lock waits and deadlocks that Read Committed avoids. Read Committed in InnoDB disables most gap locking, a common reason teams switch to it.

## Experiment 3: write skew needs Serializable

Rule: at least one doctor must stay on call. Alice and Bob both try to go off call at the same time.

```sql
CREATE TABLE oncall (doctor VARCHAR(10) PRIMARY KEY, on_call BOOLEAN NOT NULL);
INSERT INTO oncall VALUES ('alice', true), ('bob', true);

-- Each session, concurrently, with its own name
-- (set the isolation level first, as shown above):
BEGIN;
SELECT COUNT(*) FROM oncall WHERE on_call;               -- both see 2
UPDATE oncall SET on_call = false WHERE doctor = 'alice'; -- Bob's session uses 'bob'
COMMIT;
```

The two transactions update different rows, so first-updater-wins does not trigger.

| Engine and level | Result | Doctors on call |
| --- | --- | --- |
| MySQL, Repeatable Read | Both commit | 0 |
| PostgreSQL, Repeatable Read | Both commit | 0 |
| PostgreSQL, Serializable | One fails: `could not serialize access due to read/write dependencies among transactions` | 1 |
| MySQL, Serializable | One fails: `ERROR 1213 (40001): Deadlock found when trying to get lock` | 1 |

Both Serializable implementations protect the invariant, through different mechanisms. MySQL's version turns reads into shared locks, so under contention you get lock waits and deadlocks. PostgreSQL's version does not block readers but can abort transactions that would have been fine (false positives), so the abort rate rises under load. If you only need this for one invariant, `SELECT ... FOR UPDATE` on the rows that define it is usually cheaper than raising the level for the whole workload.

## Retrying correctly

Serializable and PostgreSQL Repeatable Read are only correct if the application retries.

| Error | Meaning | Action |
| --- | --- | --- |
| PG `40001` serialization_failure | Snapshot conflict | Retry the whole transaction |
| PG `40P01` deadlock_detected | Deadlock victim | Retry the whole transaction |
| MySQL `1213` (SQLSTATE `40001`) | Deadlock, transaction rolled back | Retry the whole transaction |
| MySQL `1205` lock wait timeout | Only the last statement is rolled back by default | Roll back explicitly, then retry |

The `1205` row catches people. With the default `innodb_rollback_on_timeout=OFF`, the transaction stays open with its earlier statements applied. Committing at that point persists a partial transaction.

Retry rules:

- Retry the whole transaction from `BEGIN`, re-reading data. Retrying one statement reuses a stale decision.
- Keep transactions short and free of network calls, so they hold locks and old snapshots for less time.
- Cap retries and add jitter. Unbounded retries turn contention into an outage.
- A retried transaction is safe; a retried HTTP request with side effects is not. That needs [idempotency keys]({% post_url 2026-03-21-Designing-Idempotent-APIs-for-Reliable-Backends %}).

## Reproduce it

```bash
docker run --name pg-isolation -e POSTGRES_PASSWORD=pw -d postgres:18
docker run --name mysql-isolation -e MYSQL_ROOT_PASSWORD=pw -e MYSQL_DATABASE=demo -d mysql:8.4

# Open two terminals per engine
docker exec -it pg-isolation psql -U postgres
docker exec -it mysql-isolation mysql -uroot -ppw demo

# Clean up
docker rm -f pg-isolation mysql-isolation
```

In `psql`, use `BEGIN TRANSACTION ISOLATION LEVEL ...`. In `mysql`, run `SET TRANSACTION ISOLATION LEVEL ...` before `START TRANSACTION`.

## Takeaways

- Know your effective level per connection. Do not assume the database default.
- Read-modify-write in application code is a lost update at both defaults. Use atomic `UPDATE`, `FOR UPDATE`, or a version column.
- In InnoDB Repeatable Read, snapshot reads and writes see different data. Do not decide on one and act with the other.
- Invariants across rows (quotas, on-call rules, double booking) need Serializable, explicit locks, or a constraint. Repeatable Read is not enough in either engine.
- Anything above Read Committed needs a whole-transaction retry loop that also handles MySQL `1205` correctly.

## References

- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [MySQL 8.4: InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [MySQL 8.4: Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)
- [MySQL 8.4: InnoDB Error Handling](https://dev.mysql.com/doc/refman/8.4/en/innodb-error-handling.html)

---
title: "MySQL vs PostgreSQL Isolation Levels: Defaults and Examples"
date: 2024-05-26 00:00:00 +0530
categories: [isolation, sql]
tags: [database, db, read uncommitted, repeatable read]     # TAG names should always be lowercase
description: MySQL defaults to Repeatable Read; PostgreSQL defaults to Read Committed. Here's what changes for snapshots, phantom reads, and concurrent updates.
image:
  path: /assets/img/mysqlvspostgres.webp
  alt: Database isolation levels in MySQL and PostgreSQL
pin: true
---

## The short answer

MySQL's InnoDB engine defaults to **Repeatable Read**. PostgreSQL defaults to **Read Committed**. The same query inside a transaction can behave differently depending on which database you are using.

Isolation levels define how much of another transaction's work your current transaction is allowed to observe. Let's look at the defaults, then run an example in two terminals. The MySQL behavior below is for **InnoDB**, not every MySQL storage engine.

## Overview of Isolation Levels

According to the SQL standard, there are four isolation levels. This table shows the standard's guarantees, with PostgreSQL's stronger behavior called out. It is not a table of MySQL's exact behavior:

| Isolation Level      | Dirty Read                 | Nonrepeatable Read     | Phantom Read              | Serialization Anomaly     |
| -------------------- | -------------------------- | ---------------------- | -------------------------- | ------------------------- |
| Read Uncommitted     | Allowed, but not in PG     | Possible               | Possible                   | Possible                  |
| Read Committed       | Not possible               | Possible               | Possible                   | Possible                  |
| Repeatable Read      | Not possible               | Not possible           | Allowed, but not in PG     | Possible                  |
| Serializable         | Not possible               | Not possible           | Not possible               | Not possible              |

## Default Isolation Levels in MySQL and PostgreSQL

| Behavior | MySQL (InnoDB) | PostgreSQL |
| --- | --- | --- |
| Default isolation level | `REPEATABLE READ` | `READ COMMITTED` |
| Plain reads at Read Committed | A new snapshot for each read | A new snapshot for each statement |
| Plain reads at Repeatable Read | Snapshot established by the first consistent read | Snapshot established by the first non-transaction-control statement |
| Read Uncommitted | Dirty reads are possible | Behaves like Read Committed |

Defaults can be changed. Check the connection you are actually using:

```sql
-- MySQL 8.x: current session and server default
SELECT @@SESSION.transaction_isolation, @@GLOBAL.transaction_isolation;
```

```sql
-- PostgreSQL: current transaction and session default
SHOW transaction_isolation;
SHOW default_transaction_isolation;
```

For one transaction:

```sql
-- MySQL: run before starting the transaction
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
-- Your queries here
COMMIT;
```

```sql
-- PostgreSQL
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- Your queries here
COMMIT;
```

## Detailed Comparison of Isolation Levels

### Read Uncommitted
- **Explanation**: This level allows transactions to read uncommitted changes made by other transactions, leading to dirty reads.
- **MySQL Implementation**: MySQL supports true `Read Uncommitted`, allowing dirty reads.
- **PostgreSQL Implementation**: PostgreSQL does not have a true `Read Uncommitted` level. In PostgreSQL, `Read Uncommitted` is effectively treated as `Read Committed`.

### Read Committed
- **Explanation**: A plain `SELECT` sees data committed before that statement began, not changes committed while it is running. The next `SELECT` can see newer committed data, even inside the same transaction. This prevents dirty reads but allows `non-repeatable reads`.
- **MySQL Implementation**: MySQL supports `Read Committed`, ensuring that only committed data is read.
- **PostgreSQL Implementation**: `Read Committed` is the default isolation level in PostgreSQL.

### Repeatable Read
- **Explanation**: Repeated reads use the same snapshot, so another transaction's commit does not change what a plain read sees. Your own writes are still visible. The SQL standard allows phantom reads at this level, but implementations can give stronger guarantees.
- **MySQL Implementation**: InnoDB's plain `SELECT` statements use a consistent snapshot, so repeating the query does not suddenly show another transaction's newly inserted rows. Locking reads and writes use the current state instead. For range searches, next-key locks can block inserts into the scanned gaps. Mixing snapshot reads with locking reads is where the behavior gets less obvious.
- **PostgreSQL Implementation**: The transaction keeps the same snapshot and does not see phantom rows. A concurrent insert does not itself cause an error. But if you try to update a row changed by another transaction after your snapshot was established, PostgreSQL can throw `ERROR: could not serialize access due to concurrent update`. Retry the whole transaction, not just that statement.

### Serializable
- **Explanation**: This is the strictest isolation level, ensuring complete isolation from other transactions. It prevents dirty reads, non-repeatable reads, phantom reads, and serialization anomaly. `Serialization anomaly` is when the state resulting from a group of transactions is inconsistent with all the possible ordering of the transactions.
- **MySQL Implementation**: MySQL supports `Serializable`, ensuring full isolation.
- **PostgreSQL Implementation**: PostgreSQL detects conflicting read/write dependencies and can abort a transaction with a serialization failure. Successful transactions behave as if they ran one at a time. The application still needs to retry aborted transactions.

## Experiment: Repeatable Read in PostgreSQL
Let's run an experiment to see how `Repeatable Read` works in PostgreSQL.

1. **Run in a Docker Container**:
    ```bash
    docker run --name pg-isolation -e POSTGRES_PASSWORD=PW -d postgres:18
    ```

2. **Create a New Database and Table**:
    ```bash
    docker exec -it pg-isolation psql -U postgres
    ```
    ```sql
    CREATE DATABASE new_db;
    \q
    ```
    ```bash
    docker exec -it pg-isolation psql -U postgres -d new_db
    ```
    ```sql
    CREATE TABLE users ( id SERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL );
    INSERT INTO users (username) VALUES ('u1');
    ```

3. **Connect to the Same Database from Another Terminal**:
    ```bash
    docker exec -it pg-isolation psql -U postgres -d new_db
    ```

4. **Start a Transaction and Establish a Snapshot in Each Terminal**:
    ```sql
    BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
    SELECT * FROM users WHERE id = 1;
    ```
    Run both reads before either update. `BEGIN` alone does not establish the snapshot.

5. **Fire Update Queries from Both Terminals Without Committing**:
    ```sql
    -- Terminal One
    UPDATE users SET username = 'U1_T1' WHERE id = 1;
    ```
    ```sql
    -- Terminal Two
    UPDATE users SET username = 'U1_T2' WHERE id = 1;
    ```

6. **Commit in Terminal One**:
    ```sql
    COMMIT;
    ```
    - Terminal Two was waiting for Terminal One's row lock.
    - Once Terminal One commits, Terminal Two throws `ERROR: could not serialize access due to concurrent update`.
    - Run `ROLLBACK;` in Terminal Two to leave the failed transaction.
    - If Terminal One had rolled back instead, Terminal Two's update could proceed. Commit or roll back Terminal Two when done.

7. **Clean Up the Experiment**:
    Exit both psql sessions with `\q`, then remove the disposable database container:
    ```bash
    docker rm -f pg-isolation
    ```

## Conclusion
Understanding the differences between PostgreSQL isolation levels and MySQL behavior is essential for database design and application reliability. Both databases support the standard isolation levels, but their default settings and concurrency behavior, especially around `Repeatable Read`, can lead to very different outcomes in production. Choosing the right isolation level for your workload helps protect data integrity without paying unnecessary performance costs.

If the issue is a client retrying the same operation, isolation alone is not enough. That is where [idempotency keys]({% post_url 2026-03-21-Designing-Idempotent-APIs-for-Reliable-Backends %}) come in.

## References

- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [MySQL 8.4: InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [MySQL 8.4: Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)

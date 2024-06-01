---
title: "Database Isolation Levels: MySQL vs PgSQL"
date: 2024-05-26 00:00:00 +0530
categories: [isolation, sql]
tags: [database, db, read uncommitted, repeatable read]     # TAG names should always be lowercase
---

### Introduction
Isolation levels define the degree of visibility that one transaction has over the changes made by another concurrent transaction. This article dives into the isolation levels in MySQL and PostgreSQL (PgSQL), comparing their implementations and default settings.

![Database Isolation Levels](/assets/img/mysqlvspostgres.webp)

### Overview of Isolation Levels
According to the SQL standard, there are four isolation levels:

| Isolation Level      | Dirty Read                 | Nonrepeatable Read     | Phantom Read              | Serialization Anomaly     |
| -------------------- | -------------------------- | ---------------------- | -------------------------- | ------------------------- |
| Read Uncommitted     | Allowed, but not in PG     | Possible               | Possible                   | Possible                  |
| Read Committed       | Not possible               | Possible               | Possible                   | Possible                  |
| Repeatable Read      | Not possible               | Not possible           | Allowed, but not in PG     | Possible                  |
| Serializable         | Not possible               | Not possible           | Not possible               | Not possible              |

### Default Isolation Levels in MySQL and PgSQL
- **MySQL**: The default isolation level is `Repeatable Read`.
- **PgSQL**: The default isolation level is `Read Committed`.

### Detailed Comparison of Isolation Levels

#### Read Uncommitted
- **Explanation**: This level allows transactions to read uncommitted changes made by other transactions, leading to dirty reads.
- **MySQL Implementation**: MySQL supports true `Read Uncommitted`, allowing dirty reads.
- **PgSQL Implementation**: PostgreSQL does not have a true `Read Uncommitted` level. In PgSQL, `Read Uncommitted` is essentially the same as `Read Committed`.

#### Read Committed
- **Explanation**: This level allows a query to see data changes from recently committed transactions even if they were committed after the start of the transaction query belongs to. It prevents dirty reads but allows `non-repeatable reads`.
- **MySQL Implementation**: MySQL supports `Read Committed`, ensuring that only committed data is read.
- **PgSQL Implementation**: `Read Committed` is the default isolation level in PgSQL.

#### Repeatable Read
- **Explanation**: This level ensures that if a transaction reads a row, subsequent reads will see the same data, preventing `non-repeatable reads`. However, it allows phantom reads according to the SQL standard.
- **MySQL Implementation**: MySQL supports `Repeatable Read` and allows phantom reads.
- **PgSQL Implementation**: In PgSQL, `Repeatable Read` does not allow phantom reads. Instead, if a concurrent transaction modifies the data, an error is thrown (`ERROR: could not serialize access due to concurrent update`).

#### Serializable
- **Explanation**: This is the strictest isolation level, ensuring complete isolation from other transactions. It prevents dirty reads, non-repeatable reads, phantom reads, and serialization anomaly. `Serialization anomaly` is when the state resulting from a group of transactions is inconsistent with all the possible ordering of the transactions.
- **MySQL Implementation**: MySQL supports `Serializable`, ensuring full isolation.
- **PgSQL Implementation**: PgSQL also supports `Serializable`, ensuring full isolation.

### Experiment: Repeatable Read in PgSQL
Let's run an experiment to see how `Repeatable Read` works in PgSQL.

1. **Run in a Docker Container**:
    ```bash
    docker run --name pg -e POSTGRES_PASSWORD=PW -d postgres
    ```

2. **Create a New Database and Table**:
    ```bash
    docker exec -it pg psql -U postgres
    ```
    ```sql
    CREATE DATABASE new_db;
    exit;
    ```
    ```bash
    docker exec -it pg psql -U postgres -d new_db
    ```
    ```sql
    CREATE TABLE users ( id SERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL );
    INSERT INTO users (username) VALUES ('u1');
    ```

3. **Connect to the Same Database from Another Terminal**:
    ```bash
    docker exec -it pg psql -U postgres -d new_db
    ```

4. **Start New Transactions in Both Terminals and Set Isolation Level to `Repeatable Read`**:
    ```sql
    BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
    ```

5. **Fire Update Queries from Both Terminals Without Committing**:
    ```sql
    -- Terminal One
    UPDATE users SET username = 'U1_T1' WHERE id = 1;
    ```
    ```sql
    -- Terminal Two
    UPDATE users SET username = 'U1_T2' WHERE id = 1;
    ```

6. **Observe the Behavior**:
    - Terminal One: The update query will run successfully.
    - Terminal two will wait for the first transaction to commit or rollback.
    - If first terminal commits, the second terminal will throw an error: `ERROR: could not serialize access due to concurrent update`.
    - If the first terminal rolls back, the second terminal will run successfully.

### Conclusion
Understanding the differences in isolation levels between MySQL and PgSQL is essential for database management and application development. While MySQL and PgSQL both support the standard isolation levels, their default settings and specific behaviors, especially in `Repeatable Read`, can significantly impact how transactions are handled. Choosing the right isolation level for your application ensures data integrity and optimal performance.

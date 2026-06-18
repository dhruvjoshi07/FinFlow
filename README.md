# FinFlow — High-Throughput Payment Processing System
     http://localhost:5173/

FinFlow is a robust, production-ready Distributed Payment Processing Pipeline engineered to handle high-volume transactions with absolute consistency, low latency, and fault tolerance. Built to simulate enterprise-grade financial tech architecture, the system mitigates common distributed system failure modes such as race conditions, double-spending, network partitions, and message loss.

---<img width="1747" height="902" alt="Screenshot 2026-06-18 172551" src="https://github.com/user-attachments/assets/a5b4f927-a0d5-436f-a438-50282269fe36" />


## 🚀 System Architecture & "Where" Everything Fits

FinFlow separates concerns across independent microservices to ensure horizontal scalability and zero single-points-of-failure (SPOF).

[ Client / API Gateway ]
│
▼
[ Gateway Service ] ──(Validate & Idempotency Check via Redis)
│
▼ (Publish Event)
[ Apache Kafka Cluster ] ──► Topic: payment-transactions
│
├──► [ Payment Processor Consumer ] ──► (ACID Transaction DB)
│
└──► [ Notification Service ] ──► (Webhooks/Email)

<img width="690" height="806" alt="Screenshot 2026-06-18 172423" src="https://github.com/user-attachments/assets/2d8ee098-2868-4ef0-9170-e9a0d34ef764" />


1. **API Gateway / Entry Point:** Handles client transaction requests, TLS termination, rate-limiting, and payload validation.
2. **Idempotency Layer (Redis Cache):** Intercepts requests immediately to guarantee that an identical payload retry within a specific window never causes duplicate debits.
3. **Event Broker (Apache Kafka):** Acts as the asynchronous backbone, buffering incoming traffic bursts and guaranteeing durable, ordered message delivery.
4. **Processing Engine (Worker Cluster):** Scalable consumer groups that pull from Kafka, coordinate balance checks, interface with banking cores, and execute multi-table database operations.
5. **Persistence Layer (SQL Database):** The source of truth utilizing strict ACID transaction boundaries to prevent double-spending and record a flawless audit trail[cite: 1].

---

## 🛠️ Tech Stack ("What" We Used & Why)

* **Backend / Execution Engine:** `Java` (Robust concurrency frameworks, precise memory model management, and extensive enterprise ecosystem support)[cite: 1].
* **Distributed Message Streaming:** `Apache Kafka` (Chosen for high-throughput partitioning, log compaction, and its offset-tracking system which guarantees at-least-once or exactly-once delivery guarantees)[cite: 1].
* **In-Memory Cache & Lock Manager:** `Redis` (Ultra-low latency key-value store used for immediate idempotency key verification and distributed locking mechanisms)[cite: 1].
* **Database & Persistence:** `PostgreSQL / MySQL` (Strict relational model enforcing structural constraints, foreign keys, and strong isolation levels necessary for balancing financial books)[cite: 1].
* **Testing & Simulation:** `JUnit`, `Mockito`, and concurrent load test utilities simulating multi-threaded race conditions[cite: 1].

---

## 🧠 Core Engineering Design ("How" We Solved Critical Financial Failures)

### 1. Eliminating Double-Spending (Race Conditions)
In high-concurrency environments, multiple threads might attempt to deduct from the same balance simultaneously[cite: 1]. 
* **Our Solution:** FinFlow implements a combination of **Pessimistic Locking** (`SELECT ... FOR UPDATE`) during database reads for critical balance updates, alongside **Optimistic Concurrency Control (OCC)** using version increments[cite: 1]. This ensures that an account balance can never drop below zero, even if thousands of updates arrive concurrently[cite: 1].

### 2. Microsecond Idempotency Protection
Network timeouts often lead clients to retry requests, risking double billing[cite: 1].
* **Our Solution:** Every incoming transaction requires a unique UUID string (`Idempotency-Key`)[cite: 1]. The Gateway checks this key against **Redis** using an atomic `SETNX` operation with a Time-To-Live (TTL)[cite: 1]. If the key exists, the secondary request is blocked or returns the cached original response[cite: 1].

### 3. Distributed Transaction Reliability (Outbox Pattern)
Writing to a database and publishing an event to Kafka must happen atomically[cite: 1]. If the database save succeeds but the Kafka publish fails, data corruption occurs[cite: 1].
* **Our Solution:** We implement the **Transactional Outbox Pattern**[cite: 1]. The payment record and an outbound message event are committed inside the exact same local database transaction[cite: 1]. A separate thread pools the outbox table and guarantees delivery to Kafka[cite: 1].

### 4. Asynchronous Resilience
By isolating heavy third-party bank settlement communication into asynchronous worker tasks via Kafka consumer loops, the user-facing API remains highly available with sub-100ms response times, regardless of background load[cite: 1].

---
<img width="1917" height="922" alt="Screenshot 2026-06-18 172304" src="https://github.com/user-attachments/assets/06257e74-3a51-441e-b834-03bcb70a8071" />
<img width="1907" height="917" alt="Screenshot 2026-06-18 172205" src="https://github.com/user-attachments/assets/08cd4c1f-c159-42bd-b474-2e00a5adb0d5" />
<img width="1882" height="917" alt="Screenshot 2026-06-18 172329" src="https://github.com/user-attachments/assets/1f1d3582-ab32-4aaa-a2fb-c993bcb2841a" />

## 📂 Project Structure

```text
FinFlow/
│
├── gateway-service/       # Handles ingress, authentication, rate limiting, and idempotency
│   └── src/main/java/     # Input filters, Redis checking scripts, API routing
│
├── payment-processor/     # Core engine running Kafka consumers and ledger logic
│   └── src/main/java/     # ACID balance workers, outbox publishers, DB lock handlers
│
├── notification-service/  # Dispatches asynchronous webhooks and receipt logs
│
├── core-models/           # Shared immutable DTOs, schemas, and security protocols
│
└── docker-compose.yml     # Orchestration for multi-node Kafka, ZooKeeper, Redis, and Database
🏃‍♂️ Getting Started & Local Setup
Prerequisites
Java 17 or higher Installed[cite: 1]

Maven 3.8+ Installed[cite: 1]

Docker and Docker Compose[cite: 1]

Step 1: Clone and Build
Bash
git clone [https://github.com/dhruvjoshi07/FinFlow.git](https://github.com/dhruvjoshi07/FinFlow.git)
cd FinFlow
mvn clean install
Step 2: Spin Up Infrastructure (Kafka, Redis, DB)
Bash
docker-compose up -d
Step 3: Run the Gateway and Processing Services
Bash
# Terminal 1 - Start Gateway
cd gateway-service && mvn spring-boot:run

# Terminal 2 - Start Processor Engine
cd payment-processor && mvn spring-boot:run
📈 Future Scalability & Enhancements
Implementation of a dead-letter queue (DLQ) automated alerting system for permanently poisoned transaction records[cite: 1].

Integrating real-time anomaly and fraud detection modules using streaming analysis windows[cite: 1].

Adding a dashboard view for tracking metrics like Transactions Per Second (TPS), pipeline latency, and ledger health checks[cite: 1].

Developed by Dhruv Joshi — Engineering student specializing in Big Data Analytics & Distributed Backend Architectures[cite: 1].

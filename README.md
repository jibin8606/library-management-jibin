# Library Management System (MERN)

Express + React + Node.js on **MongoDB** (Mongoose). A librarian manages books and copies and processes returns;
members register, search, borrow and track loans and fines.

> The original brief mentions PostgreSQL. This build uses MongoDB instead. Where the brief says
> `schema.sql` / `queries.sql`, this repo has the Mongoose models (`server/src/models`) and
> `queries.mongodb.js` (Q1 and Q2 as aggregation pipelines).

```
server/            Express API, models, seed script, tests
client/            React (Vite) app
queries.mongodb.js Q1 + Q2 reports (run with mongosh)
API.md             every endpoint          DECISIONS.md   design decisions (incl. R6)
AI_NOTES.md        AI usage notes          docker-compose.yml  optional local MongoDB
```

## Requirements
- Node.js 18+ (developed on 22)
- MongoDB **5.0+** running locally at `mongodb://localhost:27017` (or `docker compose up -d`)

## Setup from a fresh clone

```bash
# 1. API
cd server
cp .env.example .env        # dummy values already work locally; change JWT_SECRET if you like
npm install
npm run seed                # creates demo data + the librarian account (empties the library DB!)
npm start                   # API on http://localhost:5000

# 2. Client (new terminal)
cd client
npm install
npm run dev                 # app on http://localhost:5173 (proxies /api to :5000)
```

The database is `library` on `mongodb://localhost:27017/` (`MONGODB_URI` in `server/.env`).
Optional: `npm run seed:bulk` adds 50,000 extra books to check search/paging at scale.

## Tests
```bash
cd server
npm test
```
One command runs everything:
- **Fine calculation unit tests** (`test/fine.test.js`) - no database needed.
- **Integration tests** (`test/borrow.integration.test.js`) - business rules R1-R8 and the R6 race, against a real
  MongoDB at `TEST_MONGODB_URI` (default `mongodb://localhost:27017/library_test`; **this database is wiped**).
  If MongoDB is not reachable they are reported as *skipped*, not failed.

## Reports (Q1 / Q2)
```bash
mongosh "mongodb://localhost:27017/library" queries.mongodb.js
```
The same pipelines power the librarian's **Reports** screen.

## Test logins (created by `npm run seed`)

| Role | Email | Password | Shows |
|---|---|---|---|
| Librarian | `librarian@library.test` | `Librarian@123` | manage catalogue, loans, returns, reports |
| Member | `alice@library.test` | `Member@123` | clean slate - borrow freely |
| Member | `bob@library.test` | `Member@123` | already has 3 loans -> **R3** |
| Member | `carol@library.test` | `Member@123` | 2 overdue loans (Rs 90 accrued) -> **R4** |
| Member | `dave@library.test` | `Member@123` | has *Dune* -> **R5** (try borrowing it again) |
| Member | `erin@library.test` | `Member@123` | loan history incl. a late return with a fine |

Handy demo books: **The Last Copy** (1 copy - open two browsers as different members and click Borrow together: **R6**),
**Fully Loaned Out** (no copy free: **R2**), **Damaged Tales** (all copies damaged - not lendable), **Lost Horizon**
(1 good + 1 lost). Books with loan history cannot be deleted (**R8**) - try it on *Dune*.

## Environment variables (`server/.env.example`)
`PORT`, `MONGODB_URI`, `TEST_MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `BCRYPT_ROUNDS`.
The client needs none in dev (Vite proxies `/api`); set `VITE_API_TARGET` if the API isn't on `localhost:5000`.

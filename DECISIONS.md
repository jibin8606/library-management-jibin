# Design decisions

1. **MongoDB instead of PostgreSQL.** Requested for this build. Four collections: `users`, `books`, `copies`, `loans`
   (copies and loans are separate documents because a book can have many copies and history must be kept forever - R8).
   Loans reference member/book/copy by ObjectId. `queries.mongodb.js` replaces `queries.sql`.

2. **R6 (last copy race) - one atomic conditional update, no transactions.** Borrowing runs
   `Copy.findOneAndUpdate({ book, condition: 'good', onLoan: false }, { $set: { onLoan: true } })`.
   MongoDB applies a single-document update atomically, so two concurrent requests can never both flip the same
   copy; the loser matches nothing, gets `null`, and receives `409 NO_COPY_AVAILABLE`. I avoided multi-document
   transactions because they need a replica set and the app must run on a plain local `mongod`.
   A partial unique index on `loans {copy}` (only where `active: true`) is a second line of defence.

3. **R3 (max 3 loans) - guarded counter.** `users.activeLoans` is incremented with
   `findOneAndUpdate({ _id, activeLoans: { $lt: 3 } }, { $inc: ... })`, so several simultaneous borrows by one member
   cannot exceed 3. Trade-off: the counter is denormalised; it is decremented on return and on any failed borrow (compensation).

4. **R5 (one active loan per book) - partial unique index** `loans {member, book}` where `active: true`. Loans have a
   boolean `active` (mirror of `returnedAt == null`) because partial indexes cannot express "field is null".
   (An index filtered on `returnedAt: null` was considered and rejected for that reason.)

5. **Borrow flow order** (each step is cheap to undo): book exists -> R4 overdue check -> R5 pre-check -> claim member
   slot (R3) -> claim copy (R2/R6) -> insert loan. If anything after a claim fails, the claims are released.

6. **R7 - return is a compare-and-set** on `loans {_id, active: true}`, so a loan can only be returned once even if two
   librarians click at the same time. Copy condition is written in the same flow; only `good` copies are ever claimed
   by borrow, so damaged/lost copies cannot be lent. Fine is calculated by a pure function (`utils/fine.js`).

7. **Dates in IST.** IST has no DST, so an IST calendar day is a fixed 24h window (UTC+05:30). `dueDate = borrowedAt + 14 days`
   (same time of day). Overdue = due *day* is before today's IST day. Fine = whole IST calendar days between due day and
   return day x Rs 10, so returning on the due day (any time) costs nothing. The Q2 pipeline uses `$dateDiff` with
   `timezone: 'Asia/Kolkata'` so it agrees with the JS function (needs MongoDB 5.0+).

8. **Scale to 50,000 books.** Server-side pagination everywhere; text index on title/author for search, unique index on
   ISBN for exact lookups, `{book, condition, onLoan}` index for copy claims, loan indexes for the overdue/report queries.
   Availability counts are computed for the *page's* books only (one grouped query). `npm run seed:bulk` creates 50k books.
   Limitation: text search matches whole words (typing "harr" will not find "Harry").

9. **Auth.** JWT (HS256, 8h) in the `Authorization` header; passwords hashed with bcrypt (`bcryptjs`); the user is
   re-loaded from the DB on each request so roles are never trusted from the token alone. Public registration can only
   create members; the librarian exists only via the seed script. Login errors don't reveal whether the email exists.
   The client keeps the token in `localStorage` (simple; vulnerable to XSS - an httpOnly cookie would be the next step).

10. **One error shape** `{ error: { code, message, details? } }` with a stable machine-readable `code`; business-rule
    rejections are `409`, validation `400`, auth `401/403`, missing things `404`. Input is validated with zod.
    No SQL/string-built queries: all Mongo filters are objects built from validated values.

## Assumptions
- Lost/damaged fine: only the late fee is charged; no replacement cost is modelled.
- A copy that is on loan can't have its condition edited directly (do it through the return).
- Members can't be edited/deleted; loan history is never deleted.
- "Last 30 days" in Q1 = a rolling 30 x 24h window from now.
- Members see loan status via the app only (no emails/notifications).

## Incomplete / known limitations
- **Reservation queue (stretch) not implemented.**
- Deleting a book is check-then-delete; a borrow racing with the delete of a never-lent book could in theory create a loan
  for a just-deleted book. A soft-delete/`archived` flag would remove this.
- If the server crashes mid-borrow (after claiming, before the loan insert), a copy could stay flagged `onLoan` or a slot
  stay counted. A periodic reconciliation job would fix it; not written.
- No rate limiting on login; no refresh tokens.
- The integration tests and the app were written without a MongoDB instance available to me at authoring time (only the
  unit tests and the client build were executed), so please run `npm test` against your local MongoDB first.

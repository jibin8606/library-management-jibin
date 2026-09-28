# API reference

Base URL `http://localhost:5000/api`. JSON in, JSON out. Protected routes need `Authorization: Bearer <token>`.
Roles: **public**, **any** (any logged-in user), **member**, **librarian**.

## Error format (every error)
```json
{ "error": { "code": "NO_COPY_AVAILABLE", "message": "No copy of this book is currently available", "details": [ ... ] } }
```
`details` only appears for `VALIDATION_ERROR` (`[{ "field": "email", "message": "Invalid email" }]`).

| Status | Meaning / codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_ID`, `INVALID_JSON` |
| 401 | `UNAUTHENTICATED` (no header), `INVALID_TOKEN`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (wrong role) |
| 404 | `NOT_FOUND` (route), `BOOK_NOT_FOUND`, `COPY_NOT_FOUND`, `LOAN_NOT_FOUND` |
| 409 | conflicts / business rules: `EMAIL_TAKEN`, `DUPLICATE_VALUE` (ISBN / copy code), `NO_COPY_AVAILABLE`, `LOAN_LIMIT_REACHED`, `HAS_OVERDUE_LOANS`, `ALREADY_BORROWED`, `ALREADY_RETURNED`, `COPY_ON_LOAN`, `BOOK_HAS_LOAN_HISTORY`, `COPY_HAS_LOAN_HISTORY` |
| 500 | `INTERNAL_ERROR` |

All the endpoints below can additionally return the 400 / 401 / 403 errors above where they apply; only the
endpoint-specific errors are listed.

---
## Auth

### POST /auth/register - public
Registers a **member** (the role cannot be chosen).
```json
// request
{ "name": "Zed", "email": "zed@example.com", "password": "password1" }
// 201
{ "token": "eyJhbGciOi...", "user": { "id": "66f...", "name": "Zed", "email": "zed@example.com", "role": "member" } }
```
Errors: 400 `VALIDATION_ERROR` (password < 8 chars, bad email), 409 `EMAIL_TAKEN`.

### POST /auth/login - public
```json
// request
{ "email": "alice@library.test", "password": "Member@123" }
// 200
{ "token": "eyJhbGciOi...", "user": { "id": "66f...", "name": "Alice", "email": "alice@library.test", "role": "member" } }
```
Errors: 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS` (same error for unknown email and wrong password).

### GET /auth/me - any
`200 { "user": { "id", "name", "email", "role" } }`. Errors: 401.

---
## Books

### GET /books?q=&page=1&limit=20 - any
Paginated catalogue. `q` = title/author **words** (text index) or a full ISBN. `limit` max 100.
```json
// 200
{ "data": [ { "id": "66f...", "isbn": "9780441172719", "title": "Dune", "author": "Frank Herbert",
              "publishedYear": 1965, "totalCopies": 2, "availableCopies": 1 } ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 } }
```
`availableCopies` = copies in `good` condition that are not on loan.

### GET /books/:id - any
`200` one book (same shape as above). Errors: 400 `INVALID_ID`, 404 `BOOK_NOT_FOUND`.

### POST /books - librarian
```json
// request  (initialCopies optional, default 0; copy codes become "<isbn>-1", "<isbn>-2", ...)
{ "isbn": "978-0-441-17271-9", "title": "Dune", "author": "Frank Herbert", "publishedYear": 1965, "initialCopies": 2 }
// 201
{ "id": "66f...", "isbn": "9780441172719", "title": "Dune", "author": "Frank Herbert", "publishedYear": 1965, "totalCopies": 2, "availableCopies": 2 }
```
Errors: 400 `VALIDATION_ERROR` (bad ISBN), 403, 409 `DUPLICATE_VALUE` (ISBN exists - **R1**).

### PATCH /books/:id - librarian
Any subset of `isbn, title, author, description, publishedYear`. `200` updated book.
Errors: 400, 404 `BOOK_NOT_FOUND`, 409 `DUPLICATE_VALUE`.

### DELETE /books/:id - librarian
`204` no body; also removes the book's copies. Errors: 404 `BOOK_NOT_FOUND`,
409 `BOOK_HAS_LOAN_HISTORY` (the book has ever been lent - **R8**).

### GET /books/:id/copies - librarian
```json
// 200
{ "data": [ { "id": "66f...", "copyCode": "9780441172719-1", "condition": "good", "onLoan": false } ] }
```
Errors: 404 `BOOK_NOT_FOUND`.

### POST /books/:id/copies - librarian
```json
// request (condition: good | damaged | lost, default good)
{ "copyCode": "DUNE-EXTRA-1", "condition": "good" }
// 201
{ "id": "66f...", "copyCode": "DUNE-EXTRA-1", "condition": "good", "onLoan": false }
```
Errors: 400, 404 `BOOK_NOT_FOUND`, 409 `DUPLICATE_VALUE` (copy code exists - **R1**).

---
## Copies

### PATCH /copies/:id - librarian
```json
// request: condition and/or copyCode
{ "condition": "damaged" }
// 200
{ "id": "66f...", "book": "66f...", "copyCode": "9780441172719-1", "condition": "damaged", "onLoan": false }
```
Errors: 404 `COPY_NOT_FOUND`, 409 `COPY_ON_LOAN` (change the condition through the return instead), 409 `DUPLICATE_VALUE`.

### DELETE /copies/:id - librarian
`204`. Errors: 404 `COPY_NOT_FOUND`, 409 `COPY_HAS_LOAN_HISTORY`.

---
## Loans

Loan object:
```json
{ "id": "66f...", "status": "overdue",            // active | overdue | returned
  "overdue": true, "daysLate": 6, "fine": 60,      // fine = final if returned, otherwise accrued as of now
  "borrowedAt": "2026-09-08T05:00:00.000Z", "dueDate": "2026-09-22T05:00:00.000Z",
  "returnedAt": null, "returnCondition": null,
  "book": { "id": "...", "title": "1984", "author": "George Orwell", "isbn": "9780451524935" },
  "copy": { "id": "...", "copyCode": "9780451524935-1" },
  "member": { "id": "...", "name": "Carol", "email": "carol@library.test" } }   // name/email on librarian endpoints
```

### POST /loans - member
Borrow a **book** (the system picks a copy). Due date = now + 14 days.
```json
// request
{ "bookId": "66f..." }
// 201 -> Loan object
```
Errors: 400 `INVALID_ID`, 403 (librarians can't borrow), 404 `BOOK_NOT_FOUND`,
409 `NO_COPY_AVAILABLE` (R2/R6), `LOAN_LIMIT_REACHED` (R3), `HAS_OVERDUE_LOANS` (R4), `ALREADY_BORROWED` (R5).

### GET /loans/mine?status=all&page=1&limit=20 - member
`status`: `all | active | overdue | returned`.
```json
// 200
{ "data": [ /* Loan objects */ ],
  "pagination": { "page": 1, "limit": 20, "total": 2, "pages": 1 },
  "summary": { "activeLoans": 2, "overdueLoans": 2, "accruedFine": 90 } }
```

### GET /loans?status=&page=&limit=&memberId= - librarian
Same shape as above without `summary`; loans include `member`.

### POST /loans/:id/return - librarian
Records return date, fine and the copy's condition. Damaged/lost copies are never lent again.
```json
// request (condition: good | damaged | lost, default good)
{ "condition": "damaged" }
// 200 -> Loan object with status "returned", returnedAt, fine, returnCondition
```
Errors: 400 `INVALID_ID`, 403 (members), 404 `LOAN_NOT_FOUND`, 409 `ALREADY_RETURNED`.

---
## Reports (librarian)

### GET /reports/most-borrowed - Q1
```json
{ "data": [ { "bookId": "...", "isbn": "9780062316097", "title": "Sapiens", "author": "Yuval Noah Harari", "borrowCount": 6 } ] }
```
Top 5 books by number of loans started in the last 30 days.

### GET /reports/overdue-members - Q2
```json
{ "data": [ { "memberId": "...", "name": "Carol", "email": "carol@library.test", "overdueLoans": 2, "maxDaysLate": 6, "totalFine": 90 } ] }
```
### GET /health - public
`200 { "status": "ok" }`

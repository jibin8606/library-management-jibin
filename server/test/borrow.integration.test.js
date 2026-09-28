// Integration tests against a REAL MongoDB (default: mongodb://localhost:27017/library_test).
// They wipe that database. If MongoDB isn't reachable the tests are skipped, not failed.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.BCRYPT_ROUNDS = '4';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { User, Book, Copy, Loan, ensureIndexes } = require('../src/models');
const { signToken } = require('../src/middleware/auth');
const { addDays } = require('../src/utils/dates');

const TEST_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/library_test';
let server, base, dbReady = false;

test.before(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2500 });
    await mongoose.connection.dropDatabase();
    await ensureIndexes();
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}/api`;
    dbReady = true;
  } catch (e) {
    console.warn(`\n[integration tests skipped] MongoDB not reachable at ${TEST_URI}: ${e.message}\n`);
  }
});
test.after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
});

const it = (name, fn) =>
  test(name, async (t) => {
    if (!dbReady) return t.skip('MongoDB not reachable');
    await fn(t);
  });

// ---- helpers ----
let counter = 0;
async function makeUser(role = 'member') {
  counter += 1;
  const u = await User.create({ name: `${role} ${counter}`, email: `${role}${counter}@t.io`, passwordHash: await bcrypt.hash('x', 4), role });
  return { user: u, token: signToken(u) };
}
async function makeBook(copies = 1, extra = {}) {
  counter += 1;
  const book = await Book.create({ isbn: String(9780000000000 + counter), title: `Book ${counter}`, author: 'A', ...extra });
  const docs = Array.from({ length: copies }, (_, i) => ({ book: book._id, copyCode: `${book.isbn}-${i + 1}` }));
  if (docs.length) await Copy.insertMany(docs);
  return book;
}
const call = (method, path, token, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: r.status === 204 ? null : await r.json() }));
const borrow = (m, book) => call('POST', '/loans', m.token, { bookId: String(book._id) });

// ---- tests ----
it('R6: 10 members race for the LAST copy -> exactly one wins', async () => {
  const book = await makeBook(1);
  const members = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
  const results = await Promise.all(members.map((m) => borrow(m, book)));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  const losers = results.filter((r) => r.status !== 201);
  assert.equal(losers.length, 9);
  assert.ok(losers.every((r) => r.status === 409 && r.body.error.code === 'NO_COPY_AVAILABLE'));
  assert.equal(await Loan.countDocuments({ book: book._id, active: true }), 1);
  // losers' loan slots must have been released
  const counts = await Promise.all(members.map((m) => User.findById(m.user._id).then((u) => u.activeLoans)));
  assert.equal(counts.reduce((a, b) => a + b, 0), 1);
});

it('R6: 20 requests for a book with 5 copies -> exactly 5 succeed, all different copies', async () => {
  const book = await makeBook(5);
  const members = await Promise.all(Array.from({ length: 20 }, () => makeUser()));
  const results = await Promise.all(members.map((m) => borrow(m, book)));
  assert.equal(results.filter((r) => r.status === 201).length, 5);
  const copyIds = results.filter((r) => r.status === 201).map((r) => r.body.copy.id);
  assert.equal(new Set(copyIds).size, 5);
});

it('R2: no available copy -> rejected', async () => {
  const book = await makeBook(0);
  const r = await borrow(await makeUser(), book);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'NO_COPY_AVAILABLE');
});

it('R3: 4th concurrent book is rejected', async () => {
  const m = await makeUser();
  const books = await Promise.all([makeBook(), makeBook(), makeBook(), makeBook()]);
  const results = await Promise.all(books.map((b) => borrow(m, b))); // all at once
  assert.equal(results.filter((r) => r.status === 201).length, 3);
  assert.equal(results.filter((r) => r.body.error?.code === 'LOAN_LIMIT_REACHED').length, 1);
  assert.equal((await User.findById(m.user._id)).activeLoans, 3);
});

it('R5: same member, same book, concurrent double-click -> one loan', async () => {
  const m = await makeUser();
  const book = await makeBook(3);
  const results = await Promise.all([borrow(m, book), borrow(m, book), borrow(m, book)]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(await Loan.countDocuments({ member: m.user._id, book: book._id, active: true }), 1);
  assert.equal(await Copy.countDocuments({ book: book._id, onLoan: true }), 1);
  assert.equal((await User.findById(m.user._id)).activeLoans, 1);
});

it('R4: overdue loan blocks borrowing', async () => {
  const m = await makeUser();
  const old = await makeBook(1);
  const copy = await Copy.findOne({ book: old._id });
  await Copy.updateOne({ _id: copy._id }, { onLoan: true });
  await User.updateOne({ _id: m.user._id }, { activeLoans: 1 });
  await Loan.create({ member: m.user._id, book: old._id, copy: copy._id, borrowedAt: addDays(new Date(), -20), dueDate: addDays(new Date(), -6) });
  const r = await borrow(m, await makeBook(1));
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'HAS_OVERDUE_LOANS');
});

it('R7: only the librarian returns; a loan is returned once; damaged copy is not lendable', async () => {
  const lib = await makeUser('librarian');
  const m = await makeUser();
  const book = await makeBook(1);
  const loan = (await borrow(m, book)).body;

  assert.equal((await call('POST', `/loans/${loan.id}/return`, m.token, {})).status, 403);
  assert.equal((await call('POST', `/loans/${loan.id}/return`)).status, 401);

  const ok = await call('POST', `/loans/${loan.id}/return`, lib.token, { condition: 'damaged' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'returned');
  assert.equal(ok.body.fine, 0);

  const again = await call('POST', `/loans/${loan.id}/return`, lib.token, { condition: 'good' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_RETURNED');

  const other = await makeUser();
  const r = await borrow(other, book);
  assert.equal(r.status, 409); // the only copy is damaged now
  assert.equal(r.body.error.code, 'NO_COPY_AVAILABLE');
});

it('R7: concurrent returns of one loan -> only one succeeds', async () => {
  const lib = await makeUser('librarian');
  const m = await makeUser();
  const loan = (await borrow(m, await makeBook(1))).body;
  const results = await Promise.all([1, 2, 3, 4].map(() => call('POST', `/loans/${loan.id}/return`, lib.token, {})));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal((await User.findById(m.user._id)).activeLoans, 0);
});

it('R7: late return records the fine', async () => {
  const lib = await makeUser('librarian');
  const m = await makeUser();
  const book = await makeBook(1);
  const copy = await Copy.findOne({ book: book._id });
  await Copy.updateOne({ _id: copy._id }, { onLoan: true });
  await User.updateOne({ _id: m.user._id }, { activeLoans: 1 });
  const loan = await Loan.create({ member: m.user._id, book: book._id, copy: copy._id, borrowedAt: addDays(new Date(), -20), dueDate: addDays(new Date(), -6) });
  const r = await call('POST', `/loans/${loan._id}/return`, lib.token, { condition: 'good' });
  assert.equal(r.status, 200);
  assert.equal(r.body.daysLate, 6);
  assert.equal(r.body.fine, 60);
});

it('R8: a book that has been lent cannot be deleted; an unused one can', async () => {
  const lib = await makeUser('librarian');
  const m = await makeUser();
  const lent = await makeBook(1);
  await borrow(m, lent);
  const del = await call('DELETE', `/books/${lent._id}`, lib.token);
  assert.equal(del.status, 409);
  assert.equal(del.body.error.code, 'BOOK_HAS_LOAN_HISTORY');

  const fresh = await makeBook(2);
  assert.equal((await call('DELETE', `/books/${fresh._id}`, lib.token)).status, 204);
  assert.equal(await Copy.countDocuments({ book: fresh._id }), 0);
});

it('R1: duplicate ISBN and duplicate copy code are rejected', async () => {
  const lib = await makeUser('librarian');
  const payload = { isbn: '978-1-23456-789-7', title: 'T', author: 'A', initialCopies: 1 };
  assert.equal((await call('POST', '/books', lib.token, payload)).status, 201);
  const dup = await call('POST', '/books', lib.token, payload);
  assert.equal(dup.status, 409);
  const book = await Book.findOne({ isbn: '9781234567897' });
  const c = await call('POST', `/books/${book._id}/copies`, lib.token, { copyCode: '9781234567897-1' });
  assert.equal(c.status, 409);
});

it('authorization: members cannot manage the catalogue; errors share one shape', async () => {
  const m = await makeUser();
  const r = await call('POST', '/books', m.token, { isbn: '9781111111111', title: 'x', author: 'y' });
  assert.equal(r.status, 403);
  assert.deepEqual(Object.keys(r.body), ['error']);
  assert.ok(r.body.error.code && r.body.error.message);
  const bad = await call('GET', '/books/not-an-id', m.token);
  assert.equal(bad.status, 400);
});

it('register / login', async () => {
  const reg = await call('POST', '/auth/register', null, { name: 'Zed', email: 'zed@t.io', password: 'password1' });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.role, 'member');
  assert.equal((await call('POST', '/auth/register', null, { name: 'Zed', email: 'ZED@t.io', password: 'password1' })).status, 409);
  const stored = await User.findOne({ email: 'zed@t.io' });
  assert.notEqual(stored.passwordHash, 'password1');
  assert.equal((await call('POST', '/auth/login', null, { email: 'zed@t.io', password: 'wrongpass' })).status, 401);
  assert.equal((await call('POST', '/auth/login', null, { email: 'zed@t.io', password: 'password1' })).status, 200);
});

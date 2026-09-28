const { User, Book, Copy, Loan } = require('../models');
const { AppError } = require('../utils/errors');
const { startOfIstDay, addDays } = require('../utils/dates');
const { calculateFine, LOAN_PERIOD_DAYS } = require('../utils/fine');

const MAX_ACTIVE_LOANS = 3;

/**
 * Borrow a book (R2-R6).
 *
 * No multi-document transaction is used (they need a replica set). Instead every
 * contended resource is claimed with ONE atomic conditional update:
 *   - member slot  : User  {activeLoans < 3}  -> $inc          (R3)
 *   - physical copy: Copy  {good, !onLoan}    -> onLoan = true  (R2, R6)
 *   - one active loan per (member, book)  : partial unique index (R5)
 * If a later step fails, earlier claims are rolled back (compensation).
 */
async function borrowBook(memberId, bookId, now = new Date()) {
  const book = await Book.findById(bookId).select('_id').lean();
  if (!book) throw new AppError(404, 'BOOK_NOT_FOUND', 'Book not found');

  // R4 - any overdue loan blocks borrowing (overdue = due date before today, IST).
  const hasOverdue = await Loan.exists({
    member: memberId,
    active: true,
    dueDate: { $lt: startOfIstDay(now) },
  });
  if (hasOverdue) {
    throw new AppError(409, 'HAS_OVERDUE_LOANS', 'You have overdue loans. Return them before borrowing again.');
  }

  // R5 - friendly pre-check (the unique index below is the real guarantee).
  if (await Loan.exists({ member: memberId, book: bookId, active: true })) {
    throw new AppError(409, 'ALREADY_BORROWED', 'You already have this book on loan');
  }

  // R3 - claim one of the member's 3 slots atomically.
  const slot = await User.findOneAndUpdate(
    { _id: memberId, activeLoans: { $lt: MAX_ACTIVE_LOANS } },
    { $inc: { activeLoans: 1 } }
  );
  if (!slot) {
    throw new AppError(409, 'LOAN_LIMIT_REACHED', `You can have at most ${MAX_ACTIVE_LOANS} books on loan`);
  }

  let copy = null;
  try {
    // R2 + R6 - atomically claim exactly one available copy. Two concurrent
    // requests can never receive the same document; the loser gets null.
    copy = await Copy.findOneAndUpdate(
      { book: bookId, condition: 'good', onLoan: false },
      { $set: { onLoan: true } },
      { sort: { copyCode: 1 }, new: true }
    );
    if (!copy) {
      throw new AppError(409, 'NO_COPY_AVAILABLE', 'No copy of this book is currently available');
    }

    return await Loan.create({
      member: memberId,
      book: bookId,
      copy: copy._id,
      borrowedAt: now,
      dueDate: addDays(now, LOAN_PERIOD_DAYS),
    });
  } catch (err) {
    // Compensate: release whatever we claimed.
    if (copy) await Copy.updateOne({ _id: copy._id }, { $set: { onLoan: false } });
    await User.updateOne({ _id: memberId }, { $inc: { activeLoans: -1 } });
    if (err && err.code === 11000) {
      throw new AppError(409, 'ALREADY_BORROWED', 'You already have this book on loan');
    }
    throw err;
  }
}

/** Return a loan (R7). Librarian only (enforced in the route). */
async function returnLoan(loanId, condition, now = new Date()) {
  const loan = await Loan.findById(loanId);
  if (!loan) throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan not found');
  if (!loan.active) throw new AppError(409, 'ALREADY_RETURNED', 'This loan has already been returned');

  const { fine } = calculateFine({ dueDate: loan.dueDate, returnedAt: now });

  // Compare-and-set: only one caller can flip active true -> false.
  const updated = await Loan.findOneAndUpdate(
    { _id: loanId, active: true },
    { $set: { active: false, returnedAt: now, fine, returnCondition: condition } },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'ALREADY_RETURNED', 'This loan has already been returned');

  // Damaged / lost copies are never lendable again (borrow only claims condition: 'good').
  await Copy.updateOne({ _id: loan.copy }, { $set: { onLoan: false, condition } });
  await User.updateOne({ _id: loan.member }, { $inc: { activeLoans: -1 } });
  return updated;
}

/** Mongo filter for a loan status tab. */
function statusFilter(status, now = new Date()) {
  switch (status) {
    case 'active':
      return { active: true };
    case 'overdue':
      return { active: true, dueDate: { $lt: startOfIstDay(now) } };
    case 'returned':
      return { active: false };
    default:
      return {};
  }
}

/** Shape a (lean, populated) loan for API responses, incl. live fine for open loans. */
function presentLoan(l, now = new Date()) {
  const returned = !l.active;
  const { daysLate, fine: accrued } = calculateFine({
    dueDate: l.dueDate,
    returnedAt: returned ? l.returnedAt : now,
  });
  const fine = returned ? l.fine : accrued;
  const idOf = (x) => (x && x._id ? x._id : x);
  return {
    id: l._id,
    status: returned ? 'returned' : daysLate > 0 ? 'overdue' : 'active',
    overdue: !returned && daysLate > 0,
    daysLate,
    fine, // final fine if returned, otherwise the fine accrued as of now
    borrowedAt: l.borrowedAt,
    dueDate: l.dueDate,
    returnedAt: l.returnedAt,
    returnCondition: l.returnCondition,
    book: l.book && l.book._id ? { id: l.book._id, title: l.book.title, author: l.book.author, isbn: l.book.isbn } : { id: idOf(l.book) },
    copy: l.copy && l.copy._id ? { id: l.copy._id, copyCode: l.copy.copyCode } : { id: idOf(l.copy) },
    ...(l.member && l.member._id
      ? { member: { id: l.member._id, name: l.member.name, email: l.member.email } }
      : { member: { id: idOf(l.member) } }),
  };
}

module.exports = { borrowBook, returnLoan, statusFilter, presentLoan, MAX_ACTIVE_LOANS };

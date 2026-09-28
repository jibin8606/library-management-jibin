const User = require('./User');
const Book = require('./Book');
const Copy = require('./Copy');
const Loan = require('./Loan');

/** Make sure all indexes (incl. the unique ones the rules rely on) exist. */
async function ensureIndexes() {
  await Promise.all([User, Book, Copy, Loan].map((m) => m.init()));
}

module.exports = { User, Book, Copy, Loan, ensureIndexes };

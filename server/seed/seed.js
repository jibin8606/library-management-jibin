/**
 * Seed script.  npm run seed         -> demo data
 *               npm run seed:bulk    -> demo data + 50,000 extra books (to test search/paging at scale)
 *
 * WARNING: empties the users, books, copies and loans collections first.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { User, Book, Copy, Loan, ensureIndexes } = require('../src/models');
const { addDays } = require('../src/utils/dates');
const { calculateFine, LOAN_PERIOD_DAYS } = require('../src/utils/fine');

const PASSWORDS = { librarian: 'Librarian@123', member: 'Member@123' };

const BOOKS = [
  // [isbn, title, author, year, copies: array of conditions]
  ['9780261103344', 'The Hobbit', 'J.R.R. Tolkien', 1937, ['good', 'good', 'good']],
  ['9780441172719', 'Dune', 'Frank Herbert', 1965, ['good', 'good']],
  ['9780451524935', '1984', 'George Orwell', 1949, ['good', 'good']],
  ['9780060850524', 'Brave New World', 'Aldous Huxley', 1932, ['good', 'good']],
  ['9780132350884', 'Clean Code', 'Robert C. Martin', 2008, ['good', 'good', 'good']],
  ['9780201633610', 'Design Patterns', 'Erich Gamma', 1994, ['good', 'good']],
  ['9781491950296', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 2017, ['good', 'good']],
  ['9780262033848', 'Introduction to Algorithms', 'Thomas H. Cormen', 2009, ['good', 'good']],
  ['9780743273565', 'The Great Gatsby', 'F. Scott Fitzgerald', 1925, ['good']],
  ['9780061120084', 'To Kill a Mockingbird', 'Harper Lee', 1960, ['good', 'good']],
  ['9780140449136', 'Crime and Punishment', 'Fyodor Dostoevsky', 1866, ['good']],
  ['9780316769488', 'The Catcher in the Rye', 'J.D. Salinger', 1951, ['good']],
  ['9780062315007', 'The Alchemist', 'Paulo Coelho', 1988, ['good', 'good']],
  ['9780143039433', 'The God of Small Things', 'Arundhati Roy', 1997, ['good']],
  ['9780143127741', 'Wings of Fire', 'A.P.J. Abdul Kalam', 1999, ['good', 'good']],
  ['9780307474278', 'The Da Vinci Code', 'Dan Brown', 2003, ['good']],
  ['9780553380163', 'A Brief History of Time', 'Stephen Hawking', 1988, ['good']],
  ['9780062316097', 'Sapiens', 'Yuval Noah Harari', 2011, ['good', 'good']],
  // --- special cases used to demonstrate the rules ---
  ['9780000000017', 'The Last Copy (only 1 copy - try the R6 race)', 'Demo Author', 2020, ['good']],
  ['9780000000024', 'Fully Loaned Out (no copy available - R2)', 'Demo Author', 2020, ['good', 'good']],
  ['9780000000031', 'Damaged Tales (all copies damaged - not lendable)', 'Demo Author', 2020, ['damaged', 'damaged']],
  ['9780000000048', 'Lost Horizon (1 good, 1 lost)', 'James Hilton', 1933, ['good', 'lost']],
];

const NOW = new Date();
const daysAgo = (n) => addDays(NOW, -n);

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`Seeding database "${mongoose.connection.name}" ...`);
  await ensureIndexes();
  await Promise.all([User, Book, Copy, Loan].map((m) => m.deleteMany({})));

  // ---- users ----
  const libHash = await bcrypt.hash(PASSWORDS.librarian, config.bcryptRounds);
  const memHash = await bcrypt.hash(PASSWORDS.member, config.bcryptRounds);
  const mk = (name, email, role, hash) => User.create({ name, email, role, passwordHash: hash });
  await mk('Lena Librarian', 'librarian@library.test', 'librarian', libHash);
  const alice = await mk('Alice (clean slate)', 'alice@library.test', 'member', memHash);
  const bob = await mk('Bob (3 loans - R3)', 'bob@library.test', 'member', memHash);
  const carol = await mk('Carol (overdue - R4)', 'carol@library.test', 'member', memHash);
  const dave = await mk('Dave (has Dune - R5)', 'dave@library.test', 'member', memHash);
  const erin = await mk('Erin (history + fines)', 'erin@library.test', 'member', memHash);

  // ---- books & copies ----
  const byTitle = {};
  for (const [isbn, title, author, publishedYear, conditions] of BOOKS) {
    const book = await Book.create({ isbn, title, author, publishedYear });
    const copies = await Copy.insertMany(
      conditions.map((condition, i) => ({ book: book._id, copyCode: `${isbn}-${i + 1}`, condition }))
    );
    byTitle[title.split(' (')[0]] = { book, copies };
  }

  // Create a loan the same way the API would leave the data: copy.onLoan / user.activeLoans stay consistent.
  async function lend(member, title, copyIndex, borrowedDaysAgo, returnedDaysAgo = null, returnCondition = 'good') {
    const { book, copies } = byTitle[title];
    const copy = copies[copyIndex];
    const borrowedAt = daysAgo(borrowedDaysAgo);
    const dueDate = addDays(borrowedAt, LOAN_PERIOD_DAYS);
    const loan = { member: member._id, book: book._id, copy: copy._id, borrowedAt, dueDate };
    if (returnedDaysAgo === null) {
      await Copy.updateOne({ _id: copy._id }, { onLoan: true });
      await User.updateOne({ _id: member._id }, { $inc: { activeLoans: 1 } });
      await Loan.create(loan);
    } else {
      const returnedAt = daysAgo(returnedDaysAgo);
      const { fine } = calculateFine({ dueDate, returnedAt });
      await Loan.create({ ...loan, active: false, returnedAt, fine, returnCondition });
    }
  }

  // Bob: 3 active loans (at the R3 limit), none overdue.
  await lend(bob, 'The Hobbit', 0, 3);
  await lend(bob, 'Fully Loaned Out', 0, 5);
  await lend(bob, 'Clean Code', 0, 7);
  // Dave: has Dune (R5) and the other copy of "Fully Loaned Out" (R2: none left).
  await lend(dave, 'Dune', 0, 2);
  await lend(dave, 'Fully Loaned Out', 1, 2);
  // Carol: two OVERDUE loans -> blocked (R4). Fine today: 6 days * 10 + 3 days * 10 = Rs 90.
  await lend(carol, '1984', 0, 20);
  await lend(carol, 'Brave New World', 0, 17);
  // Erin: returned late (6 days -> Rs 60), returned on time, returned damaged.
  await lend(erin, 'The Great Gatsby', 0, 30, 10);
  await lend(erin, 'Sapiens', 0, 12, 4);
  await lend(erin, 'Wings of Fire', 0, 25, 18, 'good');
  await lend(erin, 'The Catcher in the Rye', 0, 40, 20, 'damaged');
  await Copy.updateOne({ _id: byTitle['The Catcher in the Rye'].copies[0]._id }, { condition: 'damaged' });

  // Extra returned loans in the last 30 days so the "most borrowed" report has a clear ranking.
  const popular = [
    ['Sapiens', 5], ['Clean Code', 4], ['The Hobbit', 3], ['Dune', 3], ['Wings of Fire', 2], ['1984', 2], ['The Alchemist', 1],
  ];
  let day = 28;
  for (const [title, times] of popular) {
    for (let i = 0; i < times; i += 1) {
      await lend(i % 2 ? alice : erin, title, 0, day, day - 6);
      day = day <= 8 ? 28 : day - 1;
    }
  }

  if (process.argv.includes('--bulk')) {
    console.log('Generating 50,000 extra books (this takes a few seconds) ...');
    const A = ['Silent', 'Golden', 'Hidden', 'Broken', 'Endless', 'Crimson', 'Lost', 'Ancient', 'Quiet', 'Burning'];
    const B = ['River', 'Garden', 'Empire', 'Machine', 'Kingdom', 'Ocean', 'Mirror', 'Signal', 'Harvest', 'Archive'];
    const C = ['Chronicles', 'Secrets', 'Days', 'Rules', 'Stories', 'Theory', 'Diaries', 'Legacy', 'Notes', 'Echoes'];
    const AUTH = ['Meera Nair', 'Ravi Menon', 'Ann Cole', 'Tomas Berg', 'Lucia Ortiz', 'Kenji Mori', 'Sara Khan', 'Oliver Grey'];
    const TOTAL = 50000;
    for (let start = 0; start < TOTAL; start += 5000) {
      const books = [];
      for (let i = start; i < start + 5000; i += 1) {
        books.push({
          isbn: `979${String(i).padStart(10, '0')}`,
          title: `${A[i % 10]} ${B[Math.floor(i / 10) % 10]} ${C[Math.floor(i / 100) % 10]} ${i}`,
          author: AUTH[i % AUTH.length],
          publishedYear: 1950 + (i % 75),
        });
      }
      const inserted = await Book.insertMany(books, { ordered: false });
      await Copy.insertMany(inserted.map((b, k) => ({ book: b._id, copyCode: `${b.isbn}-1`, condition: 'good' })), { ordered: false });
    }
  }

  const counts = await Promise.all([User.countDocuments(), Book.countDocuments(), Copy.countDocuments(), Loan.countDocuments()]);
  console.log(`Done: ${counts[0]} users, ${counts[1]} books, ${counts[2]} copies, ${counts[3]} loans.`);
  console.log('\nTest logins');
  console.log(`  librarian@library.test / ${PASSWORDS.librarian}`);
  console.log(`  alice|bob|carol|dave|erin@library.test / ${PASSWORDS.member}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

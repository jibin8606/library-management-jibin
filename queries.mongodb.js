/**
 * Reports Q1 and Q2 (MongoDB replacement for queries.sql).
 *
 * Run:   mongosh "mongodb://localhost:27017/library" queries.mongodb.js
 * Needs: MongoDB 5.0+ (uses $dateDiff with a timezone).
 *
 * Collections: users, books, copies, loans   (see server/src/models)
 * All dates are IST (Asia/Kolkata). Fine = Rs 10 per whole IST calendar day late.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
// 00:00 IST of "today" - a loan is overdue when its due date is before this instant.
const startOfTodayIST = new Date(Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS);
const FINE_PER_DAY = 10;

print('\n=== Q1: 5 most borrowed books in the last 30 days ===');
printjson(
  db.loans
    .aggregate([
      { $match: { borrowedAt: { $gte: new Date(now.getTime() - 30 * DAY_MS) } } },
      { $group: { _id: '$book', borrowCount: { $sum: 1 } } },
      { $sort: { borrowCount: -1, _id: 1 } }, // _id: deterministic tie-break
      { $limit: 5 },
      { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
      { $unwind: '$book' },
      { $project: { _id: 0, isbn: '$book.isbn', title: '$book.title', author: '$book.author', borrowCount: 1 } },
    ])
    .toArray()
);

print('\n=== Q2: members with overdue loans + total fine if everything is returned today ===');
printjson(
  db.loans
    .aggregate([
      { $match: { active: true, dueDate: { $lt: startOfTodayIST } } },
      {
        $addFields: {
          daysLate: { $dateDiff: { startDate: '$dueDate', endDate: now, unit: 'day', timezone: 'Asia/Kolkata' } },
        },
      },
      { $addFields: { fine: { $multiply: ['$daysLate', FINE_PER_DAY] } } },
      { $group: { _id: '$member', overdueLoans: { $sum: 1 }, maxDaysLate: { $max: '$daysLate' }, totalFine: { $sum: '$fine' } } },
      { $sort: { totalFine: -1, _id: 1 } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'member' } },
      { $unwind: '$member' },
      { $project: { _id: 0, name: '$member.name', email: '$member.email', overdueLoans: 1, maxDaysLate: 1, totalFine: 1 } },
    ])
    .toArray()
);

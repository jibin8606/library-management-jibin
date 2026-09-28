const { startOfIstDay, addDays } = require('../utils/dates');
const { FINE_PER_DAY } = require('../utils/fine');

/** Q1 - most borrowed books in the last `days` days. */
function mostBorrowedPipeline({ now = new Date(), days = 30, limit = 5 } = {}) {
  return [
    { $match: { borrowedAt: { $gte: addDays(now, -days) } } },
    { $group: { _id: '$book', borrowCount: { $sum: 1 } } },
    { $sort: { borrowCount: -1, _id: 1 } },
    { $limit: limit },
    { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
    { $unwind: '$book' },
    {
      $project: {
        _id: 0,
        bookId: '$_id',
        isbn: '$book.isbn',
        title: '$book.title',
        author: '$book.author',
        borrowCount: 1,
      },
    },
  ];
}

/** Q2 - members with overdue loans and the total fine if everything were returned today. */
function overdueMembersPipeline({ now = new Date() } = {}) {
  return [
    { $match: { active: true, dueDate: { $lt: startOfIstDay(now) } } },
    {
      $addFields: {
        // whole IST calendar days between due date and today (MongoDB >= 5.0)
        daysLate: { $dateDiff: { startDate: '$dueDate', endDate: now, unit: 'day', timezone: 'Asia/Kolkata' } },
      },
    },
    { $addFields: { fine: { $multiply: ['$daysLate', FINE_PER_DAY] } } },
    {
      $group: {
        _id: '$member',
        overdueLoans: { $sum: 1 },
        maxDaysLate: { $max: '$daysLate' },
        totalFine: { $sum: '$fine' },
      },
    },
    { $sort: { totalFine: -1, _id: 1 } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'member' } },
    { $unwind: '$member' },
    {
      $project: {
        _id: 0,
        memberId: '$_id',
        name: '$member.name',
        email: '$member.email',
        overdueLoans: 1,
        maxDaysLate: 1,
        totalFine: 1,
      },
    },
  ];
}

module.exports = { mostBorrowedPipeline, overdueMembersPipeline };

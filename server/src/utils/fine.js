const { istDayIndex } = require('./dates');

const FINE_PER_DAY = 10; // Rs
const LOAN_PERIOD_DAYS = 14;

function assertDate(value, name) {
  const d = new Date(value);
  if (value === undefined || value === null || Number.isNaN(d.getTime())) {
    throw new TypeError(`${name} must be a valid date`);
  }
  return d;
}

/**
 * Pure fine calculation (no I/O, no clock access -> trivially testable).
 * Days late = whole IST calendar days between the due date and the return date.
 * Returned on or before the due date => 0.
 */
function calculateFine({ dueDate, returnedAt }) {
  const due = assertDate(dueDate, 'dueDate');
  const returned = assertDate(returnedAt, 'returnedAt');
  const daysLate = Math.max(0, istDayIndex(returned) - istDayIndex(due));
  return { daysLate, fine: daysLate * FINE_PER_DAY };
}

module.exports = { calculateFine, FINE_PER_DAY, LOAN_PERIOD_DAYS };

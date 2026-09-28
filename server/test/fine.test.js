const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateFine, FINE_PER_DAY } = require('../src/utils/fine');
const { istDayIndex, startOfIstDay } = require('../src/utils/dates');

// Helper: build an instant from an IST wall-clock time.
const ist = (s) => new Date(`${s}+05:30`);
const fine = (due, returned) => calculateFine({ dueDate: ist(due), returnedAt: ist(returned) });

test('rate is Rs 10 per day', () => assert.equal(FINE_PER_DAY, 10));

test('returned before the due date -> no fine', () => {
  assert.deepEqual(fine('2026-09-15T10:00:00', '2026-09-10T10:00:00'), { daysLate: 0, fine: 0 });
});

test('returned exactly on the due date -> no fine', () => {
  assert.deepEqual(fine('2026-09-15T10:00:00', '2026-09-15T10:00:00'), { daysLate: 0, fine: 0 });
});

test('returned later on the due DAY (even after due time) -> no fine', () => {
  assert.equal(fine('2026-09-15T09:00:00', '2026-09-15T23:59:59').fine, 0);
});

test('one calendar day late -> Rs 10', () => {
  assert.deepEqual(fine('2026-09-15T10:00:00', '2026-09-16T10:00:00'), { daysLate: 1, fine: 10 });
});

test('counts calendar days, not 24h periods (23:59 -> 00:01 is one day late)', () => {
  assert.equal(fine('2026-09-15T23:59:00', '2026-09-16T00:01:00').fine, 10);
});

test('less than 24h but next calendar day -> still a full day late', () => {
  assert.equal(fine('2026-09-15T20:00:00', '2026-09-16T06:00:00').fine, 10);
});

test('more than 24h but same-day count is whole days only', () => {
  // due 15th 10:00, returned 17th 09:00 -> 2 calendar days after the due date
  assert.equal(fine('2026-09-15T10:00:00', '2026-09-17T09:00:00').daysLate, 2);
});

test('spans a month boundary', () => {
  assert.deepEqual(fine('2026-09-28T12:00:00', '2026-10-03T12:00:00'), { daysLate: 5, fine: 50 });
});

test('spans a year boundary and a leap day', () => {
  assert.equal(fine('2027-12-30T12:00:00', '2028-01-02T12:00:00').daysLate, 3);
  assert.equal(fine('2028-02-28T12:00:00', '2028-03-01T12:00:00').daysLate, 2); // 29 Feb exists
});

test('long overdue: 30 days -> Rs 300', () => {
  assert.equal(fine('2026-08-01T10:00:00', '2026-08-31T10:00:00').fine, 300);
});

test('IST day boundary is used, not UTC (UTC date is still "yesterday" at 00:30 IST)', () => {
  // 2026-09-16 00:30 IST == 2026-09-15 19:00 UTC. In UTC this would look like the due day.
  assert.equal(fine('2026-09-15T12:00:00', '2026-09-16T00:30:00').fine, 10);
});

test('Date objects, ISO strings and timestamps are all accepted', () => {
  const r = calculateFine({ dueDate: '2026-09-15T04:30:00.000Z', returnedAt: ist('2026-09-18T10:00:00').getTime() });
  assert.equal(r.fine, 30);
});

test('invalid input throws', () => {
  assert.throws(() => calculateFine({ dueDate: 'nope', returnedAt: new Date() }), TypeError);
  assert.throws(() => calculateFine({ dueDate: new Date(), returnedAt: undefined }), TypeError);
  assert.throws(() => calculateFine({}), TypeError);
});

test('startOfIstDay / istDayIndex helpers', () => {
  assert.equal(startOfIstDay(ist('2026-09-15T23:59:59')).toISOString(), ist('2026-09-15T00:00:00').toISOString());
  assert.equal(istDayIndex(ist('2026-09-16T00:00:00')) - istDayIndex(ist('2026-09-15T23:59:59')), 1);
});

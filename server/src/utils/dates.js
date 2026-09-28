// All business dates are in IST (UTC+05:30, no DST), so a calendar day is a
// fixed 24h window shifted by 5h30m from UTC.
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Integer index of the IST calendar day containing `date`. */
const istDayIndex = (date) => Math.floor((new Date(date).getTime() + IST_OFFSET_MS) / DAY_MS);

/** The instant at which the IST calendar day containing `date` started (00:00 IST). */
const startOfIstDay = (date) => new Date(istDayIndex(date) * DAY_MS - IST_OFFSET_MS);

const addDays = (date, n) => new Date(new Date(date).getTime() + n * DAY_MS);

module.exports = { IST_OFFSET_MS, DAY_MS, istDayIndex, startOfIstDay, addDays };

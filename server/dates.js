// Day boundaries in Europe/Madrid, expressed in UTC (Odoo stores datetimes in UTC)
const TZ = 'Europe/Madrid';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

// 'YYYY-MM-DD' of the given instant in Madrid
function madridDateStr(date) {
  return ymdFormatter.format(date);
}

// Offset (ms) of Madrid vs UTC at the given instant
function madridOffsetMs(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// UTC instant of 00:00 Madrid on the given 'YYYY-MM-DD'
function madridMidnightUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  // Two passes handle DST changes correctly
  let ts = guess.getTime() - madridOffsetMs(guess);
  ts = guess.getTime() - madridOffsetMs(new Date(ts));
  return new Date(ts);
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Odoo datetime string 'YYYY-MM-DD HH:MM:SS'
function toOdooUtc(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// Parse Odoo UTC datetime string to Date
function fromOdooUtc(str) {
  return str ? new Date(str.replace(' ', 'T') + 'Z') : null;
}

// Navalcarnero works Monday to Saturday. Extra closed days: HOLIDAYS=2026-12-25,2027-01-01
const HOLIDAYS = new Set((process.env.HOLIDAYS || '').split(',').map(s => s.trim()).filter(Boolean));
// The «Próximos días» column covers this many calendar days after the third working day
const UPCOMING_DAYS = Number(process.env.UPCOMING_DAYS) || 7;

const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = Sunday
const isWorkingDay = (ymd) => weekday(ymd) !== 0 && !HOLIDAYS.has(ymd);

function nextWorkingDay(ymd) {
  let d = addDays(ymd, 1);
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const weekdayName = (ymd) => WEEKDAYS[weekday(ymd)];

// Hoy + next two working days, plus «Próximos días», in Madrid with UTC ranges [start, end).
// Each column runs until the next one starts, so closed days (Sunday) fall in the working day
// before them and nothing is ever left out.
function madridDayRanges(now = new Date()) {
  const today = madridDateStr(now);
  const d1 = nextWorkingDay(today);
  const d2 = nextWorkingDay(d1);
  const d3 = nextWorkingDay(d2);
  const upcomingEnd = addDays(d3, UPCOMING_DAYS);
  const range = (key, date, until, title) => ({
    key, date, title,
    startUtc: madridMidnightUtc(date),
    endUtc: madridMidnightUtc(until),
  });
  // «Mañana» / «Pasado mañana» only when they really are; otherwise the weekday (Saturday: Hoy / Lunes / Martes)
  return [
    range('today', today, d1, 'Hoy'),
    range('tomorrow', d1, d2, d1 === addDays(today, 1) ? 'Mañana' : weekdayName(d1)),
    range('dayAfter', d2, d3, d1 === addDays(today, 1) && d2 === addDays(today, 2) ? 'Pasado mañana' : weekdayName(d2)),
    { ...range('upcoming', d3, upcomingEnd, 'Próximos días'), dateTo: addDays(upcomingEnd, -1) },
  ];
}

module.exports = {
  madridDateStr, madridMidnightUtc, madridDayRanges, toOdooUtc, fromOdooUtc, addDays,
  isWorkingDay, nextWorkingDay, weekdayName,
};

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

// Today / tomorrow / dayAfter in Madrid with UTC ranges [start, end)
function madridDayRanges(now = new Date()) {
  const today = madridDateStr(now);
  const keys = ['today', 'tomorrow', 'dayAfter'];
  return keys.map((key, i) => {
    const ymd = addDays(today, i);
    return {
      key,
      date: ymd,
      startUtc: madridMidnightUtc(ymd),
      endUtc: madridMidnightUtc(addDays(ymd, 1)),
    };
  });
}

module.exports = { madridDateStr, madridMidnightUtc, madridDayRanges, toOdooUtc, fromOdooUtc, addDays };

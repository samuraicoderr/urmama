function parseDateTime(str) {
  if (!str) {
    throw new Error('Date string is required');
  }
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: "${str}". Expected "YYYY-MM-DD HH:mm"`);
  }
  const [_, year, month, day, hour, minute] = match;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const h = parseInt(hour, 10);
  const min = parseInt(minute, 10);

  if (m < 1 || m > 12) {
    throw new Error(`Invalid date: "${str}"`);
  }
  const maxDays = new Date(y, m, 0).getDate();
  if (d < 1 || d > maxDays) {
    throw new Error(`Invalid date: "${str}"`);
  }
  if (h < 0 || h > 23) {
    throw new Error(`Invalid date: "${str}"`);
  }
  if (min < 0 || min > 59) {
    throw new Error(`Invalid date: "${str}"`);
  }

  return new Date(y, m - 1, d, h, min, 0, 0);
}

function toLocalISOString(date) {
  const tzOffset = -date.getTimezoneOffset();
  const diff = tzOffset >= 0 ? '+' : '-';
  const pad = num => String(num).padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  const absOffsetHour = pad(Math.floor(Math.abs(tzOffset) / 60));
  const absOffsetMin = pad(Math.abs(tzOffset) % 60);
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${diff}${absOffsetHour}:${absOffsetMin}`;
}

function getCalendarDaysCount(S, E) {
  const sDay = new Date(S.getFullYear(), S.getMonth(), S.getDate());
  const eDay = new Date(E.getFullYear(), E.getMonth(), E.getDate());
  const diffTime = eDay.getTime() - sDay.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

function getDayWindow(dayIndex, totalDays, S, E) {
  const sDay = new Date(S.getFullYear(), S.getMonth(), S.getDate());
  const dayStart = new Date(sDay.getTime() + dayIndex * 24 * 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 23, 59, 59, 999);
  
  let windowStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 0, 0, 0, 0);
  let windowEnd = dayEnd;
  
  if (dayIndex === 0) {
    windowStart = S;
  }
  if (dayIndex === totalDays - 1) {
    windowEnd = E;
  }
  
  return { start: windowStart, end: windowEnd };
}

function distributeCommitsInWindow(startTime, endTime, count) {
  if (count <= 0) return [];
  const windowDuration = endTime.getTime() - startTime.getTime();
  
  let spacing = windowDuration / (count + 1);
  if (spacing < 60000) {
    if (spacing < 1000) {
      spacing = Math.max(1, windowDuration / (count + 1));
    }
  }
  
  const dates = [];
  for (let i = 0; i < count; i++) {
    const time = startTime.getTime() + (i + 1) * spacing;
    dates.push(new Date(time));
  }
  return dates;
}

module.exports = {
  parseDateTime,
  toLocalISOString,
  getCalendarDaysCount,
  getDayWindow,
  distributeCommitsInWindow
};

const { distributeCommitsInWindow } = require('./date');

function equalize(N, D) {
  const base = Math.floor(N / D);
  const remainder = N % D;
  const buckets = new Array(D).fill(base);
  for (let i = 0; i < remainder; i++) {
    buckets[i]++;
  }
  return buckets;
}

function randomise(N, D) {
  const points = [];
  for (let i = 0; i < D - 1; i++) {
    points.push(Math.floor(Math.random() * (N + 1)));
  }
  points.sort((a, b) => a - b);
  const buckets = [];
  let prev = 0;
  for (let i = 0; i < D - 1; i++) {
    buckets.push(points[i] - prev);
    prev = points[i];
  }
  buckets.push(N - prev);
  return buckets;
}

function greedyMum(commits, S, E) {
  const result = commits.map(c => ({
    hash: c.hash,
    newAuthorDate: c.originalAuthorDate,
    newCommitterDate: c.originalCommitterDate,
    unchanged: true
  }));
  
  let bufferMs = 60 * 60 * 1000; // 1 hour
  const rangeDuration = E.getTime() - S.getTime();
  if (rangeDuration < 2 * bufferMs) {
    bufferMs = rangeDuration / 2;
  }
  
  const firstHourEnd = new Date(S.getTime() + bufferMs);
  const lastHourStart = new Date(E.getTime() - bufferMs);
  
  const firstDayStartOfDay = new Date(S.getFullYear(), S.getMonth(), S.getDate(), 0, 0, 0, 0);
  const firstDayEndOfDay = new Date(S.getFullYear(), S.getMonth(), S.getDate(), 23, 59, 59, 999);
  
  const lastDayStartOfDay = new Date(E.getFullYear(), E.getMonth(), E.getDate(), 0, 0, 0, 0);
  const lastDayEndOfDay = new Date(E.getFullYear(), E.getMonth(), E.getDate(), 23, 59, 59, 999);
  
  const beforeSIndices = [];
  const afterEIndices = [];
  const insideIndices = [];
  
  for (let i = 0; i < commits.length; i++) {
    const d = commits[i].originalAuthorDate;
    if (d < S) {
      beforeSIndices.push(i);
    } else if (d > E) {
      afterEIndices.push(i);
    } else {
      insideIndices.push(i);
    }
  }
  
  if (beforeSIndices.length === 0 && afterEIndices.length === 0) {
    return result;
  }
  
  // Case A: Commits before S
  if (beforeSIndices.length > 0) {
    const dates = distributeCommitsInWindow(S, firstHourEnd, beforeSIndices.length);
    for (let j = 0; j < beforeSIndices.length; j++) {
      const idx = beforeSIndices[j];
      result[idx].newAuthorDate = dates[j];
      result[idx].newCommitterDate = dates[j];
      result[idx].unchanged = false;
    }
  }
  
  // First-day nudges
  const firstDayNudgeIndices = [];
  for (const idx of insideIndices) {
    const d = commits[idx].originalAuthorDate;
    const isOnFirstDay = d >= firstDayStartOfDay && d <= firstDayEndOfDay;
    if (isOnFirstDay && d <= firstHourEnd) {
      firstDayNudgeIndices.push(idx);
    }
  }
  
  if (firstDayNudgeIndices.length > 0) {
    let nudgeWindowEnd = firstDayEndOfDay;
    const lastNudgeIdx = firstDayNudgeIndices[firstDayNudgeIndices.length - 1];
    
    let nextIdx = -1;
    for (let i = 0; i < insideIndices.length; i++) {
      if (insideIndices[i] === lastNudgeIdx) {
        if (i + 1 < insideIndices.length) {
          nextIdx = insideIndices[i + 1];
        }
        break;
      }
    }
    
    if (nextIdx !== -1) {
      const nextDate = commits[nextIdx].originalAuthorDate;
      const nextIsOnFirstDay = nextDate >= firstDayStartOfDay && nextDate <= firstDayEndOfDay;
      if (nextIsOnFirstDay) {
        nudgeWindowEnd = nextDate;
      }
    }
    
    const nudgeDates = distributeCommitsInWindow(firstHourEnd, nudgeWindowEnd, firstDayNudgeIndices.length);
    for (let j = 0; j < firstDayNudgeIndices.length; j++) {
      const idx = firstDayNudgeIndices[j];
      result[idx].newAuthorDate = nudgeDates[j];
      result[idx].newCommitterDate = nudgeDates[j];
      result[idx].unchanged = false;
    }
  }
  
  // Case B: Commits after E
  if (afterEIndices.length > 0) {
    const dates = distributeCommitsInWindow(lastHourStart, E, afterEIndices.length);
    for (let j = 0; j < afterEIndices.length; j++) {
      const idx = afterEIndices[j];
      result[idx].newAuthorDate = dates[j];
      result[idx].newCommitterDate = dates[j];
      result[idx].unchanged = false;
    }
  }
  
  // Last-day nudges
  const lastDayNudgeIndices = [];
  for (const idx of insideIndices) {
    const d = commits[idx].originalAuthorDate;
    const isOnLastDay = d >= lastDayStartOfDay && d <= lastDayEndOfDay;
    if (isOnLastDay && d >= lastHourStart) {
      lastDayNudgeIndices.push(idx);
    }
  }
  
  if (lastDayNudgeIndices.length > 0) {
    let nudgeWindowStart = lastDayStartOfDay;
    const firstNudgeIdx = lastDayNudgeIndices[0];
    
    let prevIdx = -1;
    for (let i = 0; i < insideIndices.length; i++) {
      if (insideIndices[i] === firstNudgeIdx) {
        if (i - 1 >= 0) {
          prevIdx = insideIndices[i - 1];
        }
        break;
      }
    }
    
    if (prevIdx !== -1) {
      const prevDate = commits[prevIdx].originalAuthorDate;
      const prevIsOnLastDay = prevDate >= lastDayStartOfDay && prevDate <= lastDayEndOfDay;
      if (prevIsOnLastDay) {
        nudgeWindowStart = prevDate;
      }
    }
    
    const nudgeDates = distributeCommitsInWindow(nudgeWindowStart, lastHourStart, lastDayNudgeIndices.length);
    for (let j = 0; j < lastDayNudgeIndices.length; j++) {
      const idx = lastDayNudgeIndices[j];
      result[idx].newAuthorDate = nudgeDates[j];
      result[idx].newCommitterDate = nudgeDates[j];
      result[idx].unchanged = false;
    }
  }
  
  return result;
}

module.exports = {
  equalize,
  randomise,
  greedyMum
};

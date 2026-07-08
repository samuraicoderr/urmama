const assert = require('assert');
const {
  parseDateTime,
  toLocalISOString,
  getCalendarDaysCount,
  getDayWindow,
  distributeCommitsInWindow
} = require('../lib/date');

const {
  equalize,
  randomise,
  greedyMum
} = require('../lib/modes');

console.log('Running Urmama Test Suite...\n');

console.log('Testing Date Utilities...');

try {
  const d = parseDateTime('2026-06-01 09:00');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 5);
  assert.strictEqual(d.getDate(), 1);
  assert.strictEqual(d.getHours(), 9);
  assert.strictEqual(d.getMinutes(), 0);
  console.log('  [PASS] parseDateTime - valid date');
} catch (e) {
  console.error('  [FAIL] parseDateTime - valid date', e);
  process.exit(1);
}

try {
  assert.throws(() => parseDateTime('2026-06-01'), /Invalid date format/);
  assert.throws(() => parseDateTime('abc'), /Invalid date format/);
  assert.throws(() => parseDateTime('2026-13-01 09:00'), /Invalid date/);
  console.log('  [PASS] parseDateTime - invalid validation');
} catch (e) {
  console.error('  [FAIL] parseDateTime - invalid validation', e);
  process.exit(1);
}

try {
  const d = new Date(2026, 5, 1, 9, 30, 0);
  const iso = toLocalISOString(d);
  assert.ok(iso.startsWith('2026-06-01T09:30:00'));
  assert.ok(/[+-]\d{2}:\d{2}$/.test(iso));
  console.log('  [PASS] toLocalISOString');
} catch (e) {
  console.error('  [FAIL] toLocalISOString', e);
  process.exit(1);
}

try {
  const s = parseDateTime('2026-06-01 09:00');
  const e1 = parseDateTime('2026-06-01 18:00');
  assert.strictEqual(getCalendarDaysCount(s, e1), 1);
  
  const e2 = parseDateTime('2026-06-04 18:00');
  assert.strictEqual(getCalendarDaysCount(s, e2), 4);
  console.log('  [PASS] getCalendarDaysCount');
} catch (e) {
  console.error('  [FAIL] getCalendarDaysCount', e);
  process.exit(1);
}

try {
  const s = parseDateTime('2026-06-01 09:00');
  const e = parseDateTime('2026-06-04 18:00');
  const d = 4;
  
  const w0 = getDayWindow(0, d, s, e);
  assert.strictEqual(w0.start.getTime(), s.getTime());
  assert.strictEqual(w0.end.getHours(), 23);
  assert.strictEqual(w0.end.getMinutes(), 59);
  
  const w2 = getDayWindow(2, d, s, e);
  assert.strictEqual(w2.start.getHours(), 0);
  assert.strictEqual(w2.start.getMinutes(), 0);
  assert.strictEqual(w2.end.getHours(), 23);
  assert.strictEqual(w2.end.getMinutes(), 59);
  
  const w3 = getDayWindow(3, d, s, e);
  assert.strictEqual(w3.start.getHours(), 0);
  assert.strictEqual(w3.start.getMinutes(), 0);
  assert.strictEqual(w3.end.getTime(), e.getTime());
  console.log('  [PASS] getDayWindow');
} catch (e) {
  console.error('  [FAIL] getDayWindow', e);
  process.exit(1);
}

try {
  const s = parseDateTime('2026-06-01 09:00');
  const e = parseDateTime('2026-06-01 10:00');
  
  const d1 = distributeCommitsInWindow(s, e, 5);
  assert.strictEqual(d1.length, 5);
  for (let i = 1; i < 5; i++) {
    assert.ok(d1[i].getTime() > d1[i - 1].getTime());
    assert.strictEqual(d1[i].getTime() - d1[i - 1].getTime(), 10 * 60 * 1000);
  }
  
  const d2 = distributeCommitsInWindow(s, e, 120);
  assert.strictEqual(d2.length, 120);
  for (let i = 1; i < 120; i++) {
    assert.ok(d2[i].getTime() > d2[i - 1].getTime());
  }
  console.log('  [PASS] distributeCommitsInWindow');
} catch (e) {
  console.error('  [FAIL] distributeCommitsInWindow', e);
  process.exit(1);
}

console.log('\nTesting Distribution Modes...');

try {
  const buckets = equalize(22, 4);
  assert.deepStrictEqual(buckets, [6, 6, 5, 5]);
  assert.strictEqual(buckets.reduce((a, b) => a + b), 22);
  console.log('  [PASS] equalize');
} catch (e) {
  console.error('  [FAIL] equalize', e);
  process.exit(1);
}

try {
  const buckets = randomise(30, 5);
  assert.strictEqual(buckets.length, 5);
  assert.strictEqual(buckets.reduce((a, b) => a + b), 30);
  assert.ok(buckets.every(val => val >= 0));
  console.log('  [PASS] randomise');
} catch (e) {
  console.error('  [FAIL] randomise', e);
  process.exit(1);
}

try {
  const S = parseDateTime('2026-06-01 09:00');
  const E = parseDateTime('2026-06-04 18:00');
  
  const mockCommits = [
    { hash: 'C1', originalAuthorDate: parseDateTime('2026-05-30 12:00'), originalCommitterDate: parseDateTime('2026-05-30 12:00'), parents: [] },
    { hash: 'C2', originalAuthorDate: parseDateTime('2026-06-01 09:15'), originalCommitterDate: parseDateTime('2026-06-01 09:15'), parents: ['C1'] },
    { hash: 'C3', originalAuthorDate: parseDateTime('2026-06-02 12:00'), originalCommitterDate: parseDateTime('2026-06-02 12:00'), parents: ['C2'] },
    { hash: 'C4', originalAuthorDate: parseDateTime('2026-06-04 17:30'), originalCommitterDate: parseDateTime('2026-06-04 17:30'), parents: ['C3'] },
    { hash: 'C5', originalAuthorDate: parseDateTime('2026-06-05 10:00'), originalCommitterDate: parseDateTime('2026-06-05 10:00'), parents: ['C4'] }
  ];
  
  const result = greedyMum(mockCommits, S, E);
  
  const c1Date = result[0].newAuthorDate;
  assert.ok(c1Date >= S && c1Date <= new Date(S.getTime() + 60 * 60 * 1000));
  
  const c2Date = result[1].newAuthorDate;
  const firstHourEnd = new Date(S.getTime() + 60 * 60 * 1000);
  assert.ok(c2Date > firstHourEnd && c2Date < mockCommits[2].originalAuthorDate);
  
  assert.strictEqual(result[2].newAuthorDate.getTime(), mockCommits[2].originalAuthorDate.getTime());
  assert.strictEqual(result[2].unchanged, true);
  
  const c4Date = result[3].newAuthorDate;
  const lastHourStart = new Date(E.getTime() - 60 * 60 * 1000);
  assert.ok(c4Date > mockCommits[2].originalAuthorDate && c4Date < lastHourStart);
  
  const c5Date = result[4].newAuthorDate;
  assert.ok(c5Date >= lastHourStart && c5Date <= E);
  
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i].newAuthorDate.getTime() > result[i - 1].newAuthorDate.getTime());
  }
  
  console.log('  [PASS] greedyMum - all cases');
} catch (e) {
  console.error('  [FAIL] greedyMum - all cases', e);
  process.exit(1);
}

console.log('\nTest suite finished successfully!');

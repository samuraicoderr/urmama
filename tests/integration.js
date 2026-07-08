const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const testDir = path.join(__dirname, 'integration_test_repo');

function resetRepo() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  run('git init -b main');
  run('git config user.name "Tester"');
  run('git config user.email "tester@example.com"');
  run('git config commit.gpgsign false');
}

function run(cmd, env = {}) {
  return execSync(cmd, {
    cwd: testDir,
    encoding: 'utf-8',
    env: { ...process.env, ...env }
  }).trim();
}

function createCommit(filename, content, dateStr, message) {
  fs.writeFileSync(path.join(testDir, filename), content);
  run('git add .');
  run('git commit -m "' + message + '"', {
    GIT_AUTHOR_DATE: dateStr,
    GIT_COMMITTER_DATE: dateStr
  });
}

const binPath = path.join(__dirname, '../bin/urmama.js');

console.log('Running Integration Tests...');

try {
  // ==========================================
  // Test 1: Equalize Mode
  // ==========================================
  console.log('\n--- TEST 1: Equalize Mode ---');
  resetRepo();
  createCommit('file1.txt', 'hello', '2026-05-01T12:00:00', 'First commit');
  createCommit('file2.txt', 'world', '2026-05-02T12:00:00', 'Second commit');
  createCommit('file3.txt', 'foo', '2026-05-03T12:00:00', 'Third commit');
  
  execSync(`node "${binPath}" --starts "2026-06-01 09:00" --ends "2026-06-03 18:00" --mode "equalize" --targetBranch "main"`, {
    cwd: testDir
  });
  
  const datesEq = run('git log main-Copy --pretty=format:"%ad" --date=iso').split('\n');
  assert.strictEqual(datesEq.length, 3);
  assert.ok(datesEq[2].startsWith('2026-06-01'));
  assert.ok(datesEq[1].startsWith('2026-06-02'));
  assert.ok(datesEq[0].startsWith('2026-06-03'));
  console.log('  [PASS] Test 1: Equalize Mode');

  // ==========================================
  // Test 2: Randomise Mode
  // ==========================================
  console.log('\n--- TEST 2: Randomise Mode ---');
  resetRepo();
  createCommit('file1.txt', 'a', '2026-05-01T12:00:00', 'C1');
  createCommit('file2.txt', 'b', '2026-05-02T12:00:00', 'C2');
  createCommit('file3.txt', 'c', '2026-05-03T12:00:00', 'C3');
  
  execSync(`node "${binPath}" --starts "2026-06-01 09:00" --ends "2026-06-03 18:00" --mode "randomise" --targetBranch "main"`, {
    cwd: testDir
  });
  
  const datesRand = run('git log main-Copy --pretty=format:"%ad" --date=iso').split('\n');
  assert.strictEqual(datesRand.length, 3);
  for (const dateStr of datesRand) {
    const d = new Date(dateStr);
    assert.ok(d >= new Date('2026-06-01T09:00:00') && d <= new Date('2026-06-03T18:00:00'));
  }
  // Check order: newest first in git log
  assert.ok(new Date(datesRand[0]) > new Date(datesRand[1]));
  assert.ok(new Date(datesRand[1]) > new Date(datesRand[2]));
  console.log('  [PASS] Test 2: Randomise Mode');

  // ==========================================
  // Test 3: GreedyMum Mode
  // ==========================================
  console.log('\n--- TEST 3: GreedyMum Mode ---');
  resetRepo();
  // S = 2026-06-01 09:00, E = 2026-06-04 18:00
  // C1: before S
  createCommit('file1.txt', '1', '2026-05-30T12:00:00', 'C1');
  // C2: inside first hour buffer [09:00, 10:00]
  createCommit('file2.txt', '2', '2026-06-01T09:15:00', 'C2');
  // C3: normal inside
  createCommit('file3.txt', '3', '2026-06-02T12:00:00', 'C3');
  // C4: inside last hour buffer [17:00, 18:00] on last day
  createCommit('file4.txt', '4', '2026-06-04T17:30:00', 'C4');
  // C5: after E
  createCommit('file5.txt', '5', '2026-06-05T10:00:00', 'C5');
  
  execSync(`node "${binPath}" --starts "2026-06-01 09:00" --ends "2026-06-04 18:00" --mode "greedyMum" --targetBranch "main"`, {
    cwd: testDir
  });
  
  // Get rewritten details. Log returns them in reverse order (C5, C4, C3, C2, C1)
  const commitsLog = run('git log main-Copy --pretty=format:"%s|%ad" --date=iso').split('\n');
  const details = commitsLog.map(line => {
    const [msg, dateStr] = line.split('|');
    return { msg, date: new Date(dateStr) };
  });
  
  // Check C3 is unchanged (2026-06-02 12:00)
  const c3 = details.find(c => c.msg === 'C3');
  // Date parsing might shift timezones so let's compare UTC epoch
  assert.strictEqual(c3.date.getTime(), new Date('2026-06-02T12:00:00').getTime());
  
  // Check C1 is in first hour buffer
  const c1 = details.find(c => c.msg === 'C1');
  assert.ok(c1.date >= new Date('2026-06-01T09:00:00') && c1.date <= new Date('2026-06-01T10:00:00'));
  
  // Check C2 is nudged after first hour buffer, before C3
  const c2 = details.find(c => c.msg === 'C2');
  assert.ok(c2.date > new Date('2026-06-01T10:00:00') && c2.date < c3.date);
  
  // Check C5 is in last hour buffer
  const c5 = details.find(c => c.msg === 'C5');
  assert.ok(c5.date >= new Date('2026-06-04T17:00:00') && c5.date <= new Date('2026-06-04T18:00:00'));
  
  // Check C4 is nudged before last hour buffer, after C3
  const c4 = details.find(c => c.msg === 'C4');
  assert.ok(c4.date > c3.date && c4.date < new Date('2026-06-04T17:00:00'));
  
  // Ensure chronological order
  for (let i = 0; i < details.length - 1; i++) {
    assert.ok(details[i].date > details[i + 1].date);
  }
  
  console.log('  [PASS] Test 3: GreedyMum Mode');

  // ==========================================
  // Test 4: In-Place rewrite with backup
  // ==========================================
  console.log('\n--- TEST 4: In-Place Rewrite with Backup ---');
  resetRepo();
  createCommit('file1.txt', 'x', '2026-05-01T12:00:00', 'Orig Commit');
  const origHead = run('git rev-parse HEAD');
  
  // Run with --useTargetAsDest true and --destBranch main-backup
  // Use spawnSync/execSync with input 'y' for confirmation prompt
  const stdout = execSync(`node "${binPath}" --starts "2026-06-01 09:00" --ends "2026-06-03 18:00" --mode "equalize" --targetBranch "main" --useTargetAsDest true --destBranch "main-backup"`, {
    cwd: testDir,
    input: 'y\n',
    encoding: 'utf-8'
  });
  
  // main-backup should point to origHead
  const backupHead = run('git rev-parse main-backup');
  assert.strictEqual(backupHead, origHead);
  
  // main should be rewritten
  const newHead = run('git rev-parse main');
  assert.notStrictEqual(newHead, origHead);
  
  const mainDateStr = run('git log -1 --pretty=format:"%ad" --date=iso');
  const mainDate = new Date(mainDateStr);
  assert.ok(mainDate >= new Date('2026-06-01T09:00:00') && mainDate <= new Date('2026-06-03T18:00:00'));
  
  console.log('  [PASS] Test 4: In-Place Rewrite with Backup');

  console.log('\nALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  
} catch (err) {
  console.error('\n  [FAIL] Integration test failed:', err);
  process.exit(1);
} finally {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

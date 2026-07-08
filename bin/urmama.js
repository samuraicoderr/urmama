#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const {
  isInsideGitWorktree,
  hasUncommittedChanges,
  getCurrentBranch,
  branchExists,
  getCommitsReverse,
  getCommitDetails,
  createCommitTree,
  updateBranchRef,
  resetHard,
  copyBranch,
  forcePush
} = require('../lib/git');

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

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function generateRandomId() {
  return Math.random().toString(36).substring(2, 10);
}

function printUsage() {
  console.log(`
Usage: urmama --starts "YYYY-MM-DD HH:mm" --ends "YYYY-MM-DD HH:mm" [options]

Required Options:
  --starts "YYYY-MM-DD HH:mm"   Start datetime (inclusive)
  --ends "YYYY-MM-DD HH:mm"     End datetime (inclusive)

Optional Options:
  --targetBranch <name>         Branch to rewrite (defaults to current active branch)
  --destBranch <name>           Branch to contain rewritten commits
  --useTargetAsDest [true|false] Rewrite history directly on target branch (default: false)
  --mode <mode>                 Distribution mode: "randomise", "equalize", "greedyMum" (default: "randomise")
  --forcePushTo <remote>        Remote name to force push to (e.g. "origin")
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  let startsStr = null;
  let endsStr = null;
  let targetBranch = null;
  let destBranch = null;
  let useTargetAsDest = false;
  let mode = 'randomise';
  let forcePushTo = null;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--starts') {
      startsStr = args[++i];
    } else if (arg === '--ends') {
      endsStr = args[++i];
    } else if (arg === '--targetBranch') {
      targetBranch = args[++i];
    } else if (arg === '--destBranch') {
      destBranch = args[++i];
    } else if (arg === '--useTargetAsDest') {
      const next = args[i + 1];
      if (next === 'true') {
        useTargetAsDest = true;
        i++;
      } else if (next === 'false') {
        useTargetAsDest = false;
        i++;
      } else {
        useTargetAsDest = true;
      }
    } else if (arg === '--mode') {
      mode = args[++i];
    } else if (arg === '--forcePushTo') {
      forcePushTo = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  
  if (!startsStr || !endsStr) {
    console.error('Error: Both --starts and --ends must be provided.');
    printUsage();
    process.exit(1);
  }
  
  let S, E;
  try {
    S = parseDateTime(startsStr);
    E = parseDateTime(endsStr);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  
  if (S.getTime() >= E.getTime()) {
    console.error('Error: --starts must be before --ends');
    process.exit(1);
  }
  
  const allowedModes = ['randomise', 'equalize', 'greedyMum'];
  if (!allowedModes.includes(mode)) {
    console.error(`Error: Invalid mode "${mode}". Must be one of: ${allowedModes.join(', ')}`);
    process.exit(1);
  }
  
  if (!isInsideGitWorktree()) {
    console.error('Error: Not inside a Git repository.');
    process.exit(1);
  }
  
  if (hasUncommittedChanges()) {
    console.error('Error: Working directory has uncommitted changes. Please commit or stash them first.');
    process.exit(1);
  }
  
  const activeBranch = getCurrentBranch();
  if (!targetBranch) {
    targetBranch = activeBranch;
  }
  
  if (!branchExists(targetBranch)) {
    console.error(`Error: Target branch "${targetBranch}" does not exist.`);
    process.exit(1);
  }
  
  console.log(`Collecting commits on branch "${targetBranch}"...`);
  const commitHashes = getCommitsReverse(targetBranch);
  const N = commitHashes.length;
  if (N === 0) {
    console.error(`Error: No commits found on branch "${targetBranch}".`);
    process.exit(1);
  }
  
  console.log(`Found ${N} commit(s) to rewrite.`);
  const commits = commitHashes.map(hash => getCommitDetails(hash));
  
  let commitMappings;
  if (mode === 'greedyMum') {
    commitMappings = greedyMum(commits, S, E);
  } else {
    const D = getCalendarDaysCount(S, E);
    const bucketSizes = mode === 'equalize' ? equalize(N, D) : randomise(N, D);
    
    const newCommitDates = [];
    let commitIdx = 0;
    for (let dayIdx = 0; dayIdx < D; dayIdx++) {
      const count = bucketSizes[dayIdx];
      if (count > 0) {
        const { start, end } = getDayWindow(dayIdx, D, S, E);
        const dates = distributeCommitsInWindow(start, end, count);
        for (let j = 0; j < count; j++) {
          newCommitDates[commitIdx++] = dates[j];
        }
      }
    }
    
    commitMappings = commits.map((c, i) => ({
      hash: c.hash,
      newAuthorDate: newCommitDates[i],
      newCommitterDate: newCommitDates[i],
      unchanged: false
    }));
  }
  
  let destBranchName = destBranch;
  let isBackupNeeded = false;
  
  if (!useTargetAsDest) {
    if (!destBranchName) {
      const defaultName = `${targetBranch}-Copy`;
      if (branchExists(defaultName)) {
        const randomId = generateRandomId();
        destBranchName = `${defaultName}_${randomId}`;
      } else {
        destBranchName = defaultName;
      }
    }
  } else {
    if (destBranchName) {
      isBackupNeeded = true;
    }
    destBranchName = targetBranch;
  }
  
  console.log('\n--- URMAMA Rewrite Configuration ---');
  console.log(`Target Branch:       ${targetBranch}`);
  console.log(`Destination Branch:  ${destBranchName}`);
  if (isBackupNeeded) {
    console.log(`Backup Branch:       ${destBranch}`);
  }
  console.log(`Distribution Mode:   ${mode}`);
  console.log(`Time Range (Local):  ${toLocalISOString(S)} -> ${toLocalISOString(E)}`);
  if (forcePushTo) {
    console.log(`Force Push To:       ${forcePushTo}`);
  }
  console.log('------------------------------------');
  
  const willModifyTarget = useTargetAsDest;
  if (willModifyTarget) {
    console.log('\n[WARNING] You have enabled --useTargetAsDest.');
    console.log(`This will rewrite the history of "${targetBranch}" IN-PLACE.`);
    console.log('Ensure you have a backup of this branch if it is remote or shared.');
    
    const confirm = await askConfirmation(`Are you sure you want to rewrite "${targetBranch}"? (y/N): `);
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('Operation cancelled by user. Exiting.');
      process.exit(0);
    }
  }
  
  console.log('\nRewriting commit history...');
  
  if (isBackupNeeded) {
    console.log(`Creating backup branch "${destBranch}" from "${targetBranch}"...`);
    copyBranch(targetBranch, destBranch);
  }
  
  const rewrittenMap = {};
  
  for (let i = 0; i < N; i++) {
    const c = commits[i];
    const mapping = commitMappings[i];
    
    const newParents = c.parents.map(p => rewrittenMap[p] || p);
    
    const authorDateStr = toLocalISOString(mapping.newAuthorDate);
    const committerDateStr = toLocalISOString(mapping.newCommitterDate);
    
    const newHash = createCommitTree(
      c.tree,
      newParents,
      c.authorName,
      c.authorEmail,
      authorDateStr,
      c.committerName,
      c.committerEmail,
      committerDateStr,
      c.message
    );
    
    rewrittenMap[c.hash] = newHash;
    console.log(`  [${i + 1}/${N}] Rewrote ${c.hash.slice(0, 7)} -> ${newHash.slice(0, 7)}`);
  }
  
  const lastOldHash = commitHashes[N - 1];
  const newHeadHash = rewrittenMap[lastOldHash];
  
  const isUpdatingActiveBranch = (destBranchName === activeBranch);
  
  if (isUpdatingActiveBranch) {
    console.log(`Updating current active branch "${destBranchName}" to new HEAD...`);
    resetHard(newHeadHash);
  } else {
    console.log(`Updating branch "${destBranchName}" reference to new HEAD...`);
    updateBranchRef(destBranchName, newHeadHash);
  }
  
  console.log(`Successfully rewrote history! Branch "${destBranchName}" is now at ${newHeadHash.slice(0, 7)}.`);
  
  if (forcePushTo) {
    console.log(`Force pushing "${destBranchName}" to remote "${forcePushTo}"...`);
    try {
      forcePush(forcePushTo, destBranchName);
      console.log('Force push completed successfully.');
    } catch (err) {
      console.error(`Error performing force push: ${err.message}`);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

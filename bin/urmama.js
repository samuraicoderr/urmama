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
  forcePush,
  getLocalBranches
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

function selectOption(question, options, startIndex = 0) {
  return new Promise((resolve) => {
    let cursor = startIndex;
    const stdout = process.stdout;
    const stdin = process.stdin;
    
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    
    stdout.write('\x1B[?25l');
    
    function render() {
      readline.cursorTo(stdout, 0);
      readline.clearScreenDown(stdout);
      
      stdout.write(`\x1B[1m\x1B[35m?\x1B[0m \x1B[1m${question}\x1B[0m \x1B[2m(Use arrows / j/k, press Enter)\x1B[0m\n`);
      for (let i = 0; i < options.length; i++) {
        if (i === cursor) {
          stdout.write(`  \x1B[36m❯ \x1B[1m● ${options[i]}\x1B[0m\n`);
        } else {
          stdout.write(`    \x1B[2m○\x1B[0m ${options[i]}\n`);
        }
      }
      readline.moveCursor(stdout, 0, -(options.length + 1));
    }
    
    render();
    
    function onKeypress(str, key) {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(1);
      }
      
      if (key && (key.name === 'return' || key.name === 'enter')) {
        cleanup();
        resolve(cursor);
        return;
      }
      
      if (key && (key.name === 'up' || key.name === 'k')) {
        cursor = (cursor - 1 + options.length) % options.length;
        render();
      } else if (key && (key.name === 'down' || key.name === 'j')) {
        cursor = (cursor + 1) % options.length;
        render();
      }
    }
    
    function cleanup() {
      stdin.removeListener('keypress', onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdout.write('\x1B[?25h');
      readline.cursorTo(stdout, 0);
      readline.clearScreenDown(stdout);
      stdout.write(`\x1B[1m\x1B[32m✔\x1B[0m \x1B[1m${question}\x1B[0m \x1B[36m${options[cursor]}\x1B[0m\n`);
    }
    
    stdin.on('keypress', onKeypress);
  });
}

function textPrompt(question, defaultValue = '', validator = null) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const formattedQuestion = defaultValue 
      ? `\x1B[1m\x1B[35m?\x1B[0m \x1B[1m${question}\x1B[0m \x1B[2m(${defaultValue})\x1B[0m: `
      : `\x1B[1m\x1B[35m?\x1B[0m \x1B[1m${question}\x1B[0m: `;
      
    function ask() {
      rl.question(formattedQuestion, (answer) => {
        const result = answer.trim() || defaultValue;
        if (validator) {
          try {
            validator(result);
            rl.close();
            readline.moveCursor(process.stdout, 0, -1);
            readline.clearLine(process.stdout, 0);
            process.stdout.write(`\x1B[1m\x1B[32m✔\x1B[0m \x1B[1m${question}\x1B[0m \x1B[36m${result}\x1B[0m\n`);
            resolve(result);
          } catch (err) {
            console.log(`\x1B[31m>> ${err.message}\x1B[0m`);
            ask();
          }
        } else {
          rl.close();
          readline.moveCursor(process.stdout, 0, -1);
          readline.clearLine(process.stdout, 0);
          process.stdout.write(`\x1B[1m\x1B[32m✔\x1B[0m \x1B[1m${question}\x1B[0m \x1B[36m${result}\x1B[0m\n`);
          resolve(result);
        }
      });
    }
    
    ask();
  });
}

async function runWizard() {
  console.log(`\x1B[1m\x1B[35m
   _   _ ____  __  __    _    __  __    _    
  | | | |  _ \\|  \\/  |  / \\  |  \\/  |  / \\   
  | | | | |_) | |\\/| | / _ \\ | |\\/| | / _ \\  
  | |_| |  _ <| |  | |/ ___ \\| |  | |/ ___ \\ 
   \\___/|_| \\_\\_|  |_/_/   \\_\\_|  |_/_/   \\_\\
  \x1B[0m`);
  console.log('\x1B[1m\x1B[36m  Welcome to URMAMA Git History Rewriter CLI Wizard! \x1B[0m');
  console.log('\x1B[2m  -------------------------------------------------------------\x1B[0m\n');
  
  if (!isInsideGitWorktree()) {
    console.error('\x1B[31mError: Not inside a Git repository.\x1B[0m');
    process.exit(1);
  }
  
  if (hasUncommittedChanges()) {
    console.error('\x1B[31mError: Working directory has uncommitted changes. Please commit or stash them first.\x1B[0m');
    process.exit(1);
  }
  
  const activeBranch = getCurrentBranch();
  const branches = getLocalBranches();
  
  const branchOptions = branches.filter(b => b !== activeBranch);
  branchOptions.unshift(activeBranch);
  branchOptions.push('Enter branch name manually...');
  
  const branchSelectionIdx = await selectOption('Select target branch to rewrite:', branchOptions, 0);
  let targetBranch = branchOptions[branchSelectionIdx];
  
  if (targetBranch === 'Enter branch name manually...') {
    targetBranch = await textPrompt('Enter target branch name:', activeBranch, (input) => {
      if (!branchExists(input)) {
        throw new Error(`Branch "${input}" does not exist.`);
      }
    });
  }
  
  let S, S_str;
  S_str = await textPrompt('Enter start datetime (YYYY-MM-DD HH:mm):', '', (input) => {
    S = parseDateTime(input);
  });
  
  let E, E_str;
  E_str = await textPrompt('Enter end datetime (YYYY-MM-DD HH:mm):', '', (input) => {
    E = parseDateTime(input);
    if (E.getTime() <= S.getTime()) {
      throw new Error(`End datetime must be after start datetime (${toLocalISOString(S)})`);
    }
  });
  
  const modes = ['randomise', 'equalize', 'greedyMum'];
  const modeDescriptions = [
    'randomise (Default) - Distribute commits randomly across range',
    'equalize            - Distribute commits evenly across range',
    'greedyMum           - Preserve inside commits, nudge outside commits'
  ];
  const modeIdx = await selectOption('Select distribution mode:', modeDescriptions, 0);
  const mode = modes[modeIdx];
  
  const strategies = [
    'Create a safe copy branch (Safe mode)',
    'Rewrite the target branch in-place'
  ];
  const strategyIdx = await selectOption('Select branch rewriting strategy:', strategies, 0);
  
  let useTargetAsDest = false;
  let destBranch = null;
  let isBackupNeeded = false;
  let backupBranch = null;
  
  if (strategyIdx === 0) {
    const defaultCopy = `${targetBranch}-Copy`;
    let suggestedCopy = defaultCopy;
    if (branchExists(defaultCopy)) {
      suggestedCopy = `${defaultCopy}_${generateRandomId()}`;
    }
    destBranch = await textPrompt('Enter destination branch name:', suggestedCopy);
  } else {
    useTargetAsDest = true;
    const backupOptions = [
      'Create a backup branch first (Recommended)',
      'Do not create a backup branch'
    ];
    const backupIdx = await selectOption('Do you want to create a backup branch?', backupOptions, 0);
    if (backupIdx === 0) {
      isBackupNeeded = true;
      backupBranch = await textPrompt('Enter backup branch name:', `${targetBranch}-Backup`);
      destBranch = backupBranch;
    }
  }
  
  const remotes = ['Do not force push', 'origin', 'Enter other remote name...'];
  const remoteIdx = await selectOption('Select remote force-push option:', remotes, 0);
  let forcePushTo = null;
  if (remoteIdx === 1) {
    forcePushTo = 'origin';
  } else if (remoteIdx === 2) {
    forcePushTo = await textPrompt('Enter remote name:');
  }
  
  const finalDest = useTargetAsDest ? targetBranch : destBranch;
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│             URMAMA CLI REWRITE SUMMARY                 │');
  console.log('├────────────────────────────────────────────────────────┤');
  console.log(`│  Target Branch:       \x1B[36m${targetBranch.padEnd(32)}\x1B[0m │`);
  console.log(`│  Destination Branch:  \x1B[36m${finalDest.padEnd(32)}\x1B[0m │`);
  if (isBackupNeeded) {
    console.log(`│  Backup Branch:       \x1B[36m${backupBranch.padEnd(32)}\x1B[0m │`);
  }
  console.log(`│  Distribution Mode:   \x1B[36m${mode.padEnd(32)}\x1B[0m │`);
  console.log(`│  Start DateTime:      \x1B[36m${toLocalISOString(S).padEnd(32)}\x1B[0m │`);
  console.log(`│  End DateTime:        \x1B[36m${toLocalISOString(E).padEnd(32)}\x1B[0m │`);
  console.log(`│  Force Push Remote:   \x1B[36m${(forcePushTo || 'None').padEnd(32)}\x1B[0m │`);
  console.log('└────────────────────────────────────────────────────────┘\n');
  
  const runOptions = ['Yes, execute history rewrite', 'No, cancel and exit'];
  const runChoiceIdx = await selectOption('Proceed with the rewrite?', runOptions, 0);
  if (runChoiceIdx !== 0) {
    console.log('Operation cancelled. Exiting.');
    process.exit(0);
  }
  
  await executeRewrite({
    targetBranch,
    destBranch: finalDest,
    backupBranch: isBackupNeeded ? backupBranch : null,
    useTargetAsDest,
    mode,
    S,
    E,
    forcePushTo,
    activeBranch
  });
}

async function executeRewrite({
  targetBranch,
  destBranch,
  backupBranch,
  useTargetAsDest,
  mode,
  S,
  E,
  forcePushTo,
  activeBranch
}) {
  console.log(`\nCollecting commits on branch "${targetBranch}"...`);
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

  console.log('\nRewriting commit history...');
  
  if (backupBranch) {
    console.log(`Creating backup branch "${backupBranch}" from "${targetBranch}"...`);
    copyBranch(targetBranch, backupBranch);
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
  
  const destBranchName = destBranch;
  const isUpdatingActiveBranch = (destBranchName === activeBranch);
  
  if (isUpdatingActiveBranch) {
    console.log(`Updating current active branch "${destBranchName}" to new HEAD...`);
    resetHard(newHeadHash);
  } else {
    console.log(`Updating branch "${destBranchName}" reference to new HEAD...`);
    updateBranchRef(destBranchName, newHeadHash);
  }
  console.log(`\x1B[32mSuccessfully rewrote history! Branch "${destBranchName}" is now at ${newHeadHash.slice(0, 7)}.\x1B[0m`);
  console.log(`\nTo inspect the rewritten commits and verify dates, run:`);
  console.log(`  \x1B[36mgit log ${destBranchName} --format="%h %ad %s" --date=short\x1B[0m\n`);
  
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
    if (args.length > 0) {
      console.error('Error: Both --starts and --ends must be provided for command line execution.');
      printUsage();
      process.exit(1);
    }
    await runWizard();
    return;
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
  
  await executeRewrite({
    targetBranch,
    destBranch: destBranchName,
    backupBranch: isBackupNeeded ? destBranch : null,
    useTargetAsDest,
    mode,
    S,
    E,
    forcePushTo,
    activeBranch
  });
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

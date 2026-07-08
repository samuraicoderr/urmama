const { execSync } = require('child_process');

function runGit(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    const message = error.message || '';
    throw new Error(`Git command failed: ${cmd}\nError: ${message}\nStderr: ${stderr}`);
  }
}

function isInsideGitWorktree() {
  try {
    const res = runGit('git rev-parse --is-inside-work-tree');
    return res === 'true';
  } catch (e) {
    return false;
  }
}

function hasUncommittedChanges() {
  const status = runGit('git status --porcelain');
  return status.length > 0;
}

function getCurrentBranch() {
  return runGit('git rev-parse --abbrev-ref HEAD');
}

function branchExists(branchName) {
  try {
    runGit(`git show-ref --verify refs/heads/${branchName}`);
    return true;
  } catch (e) {
    return false;
  }
}

function getCommitsReverse(branchName) {
  const output = runGit(`git rev-list --reverse ${branchName}`);
  return output ? output.split('\n') : [];
}

function getCommitDetails(hash) {
  const raw = runGit(`git cat-file -p ${hash}`);
  const lines = raw.split('\n');
  
  let tree = '';
  const parents = [];
  let authorName = '';
  let authorEmail = '';
  let committerName = '';
  let committerEmail = '';
  let originalAuthorTimestamp = 0;
  let originalAuthorOffset = '+0000';
  let originalCommitterTimestamp = 0;
  let originalCommitterOffset = '+0000';
  let messageIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      messageIndex = i + 1;
      break;
    }
    if (line.startsWith('tree ')) {
      tree = line.slice(5).trim();
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7).trim());
    } else if (line.startsWith('author ')) {
      const emailStart = line.indexOf('<');
      const emailEnd = line.indexOf('>');
      authorName = line.slice(7, emailStart).trim();
      authorEmail = line.slice(emailStart + 1, emailEnd).trim();
      
      const rest = line.slice(emailEnd + 1).trim().split(/\s+/);
      originalAuthorTimestamp = parseInt(rest[0]);
      originalAuthorOffset = rest[1] || '+0000';
    } else if (line.startsWith('committer ')) {
      const emailStart = line.indexOf('<');
      const emailEnd = line.indexOf('>');
      committerName = line.slice(10, emailStart).trim();
      committerEmail = line.slice(emailStart + 1, emailEnd).trim();
      
      const rest = line.slice(emailEnd + 1).trim().split(/\s+/);
      originalCommitterTimestamp = parseInt(rest[0]);
      originalCommitterOffset = rest[1] || '+0000';
    }
  }
  
  const message = lines.slice(messageIndex).join('\n');
  return {
    hash,
    tree,
    parents,
    authorName,
    authorEmail,
    committerName,
    committerEmail,
    originalAuthorDate: new Date(originalAuthorTimestamp * 1000),
    originalAuthorOffset,
    originalCommitterDate: new Date(originalCommitterTimestamp * 1000),
    originalCommitterOffset,
    message
  };
}

function createCommitTree(treeHash, parents, authorName, authorEmail, authorDateStr, committerName, committerEmail, committerDateStr, message) {
  const parentArgs = parents.map(p => `-p ${p}`).join(' ');
  const cmd = `git commit-tree ${treeHash} ${parentArgs}`;
  
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: authorName,
    GIT_AUTHOR_EMAIL: authorEmail,
    GIT_AUTHOR_DATE: authorDateStr,
    GIT_COMMITTER_NAME: committerName,
    GIT_COMMITTER_EMAIL: committerEmail,
    GIT_COMMITTER_DATE: committerDateStr
  };
  
  return runGit(cmd, { input: message, env });
}

function updateBranchRef(branchName, commitHash) {
  runGit(`git update-ref refs/heads/${branchName} ${commitHash}`);
}

function resetHard(commitHash) {
  runGit(`git reset --hard ${commitHash}`);
}

function copyBranch(src, dest) {
  runGit(`git branch -f ${dest} ${src}`);
}

function forcePush(remote, branchName) {
  runGit(`git push --force ${remote} ${branchName}`);
}

module.exports = {
  runGit,
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
};

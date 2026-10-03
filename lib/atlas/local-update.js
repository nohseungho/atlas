import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync as exists } from 'node:fs';

const BRANCH = 'fix/naver-rss-dedupe';
const allowedRemote = (url) => /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)nohseungho\/atlas(?:\.git)?\/?$/.test(url);

// Fetch and merge only this repository's operating branch. Never stash, reset,
// force-push, commit user data, or continue a conflicting merge.
export function updateLocalAtlas(root, { remoteAllowed = allowedRemote } = {}) {
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'merge.autoStash=false', ...args], {
      cwd: root, encoding: 'utf8', windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || result.stdout.trim() || 'Git 작업 실패');
    return args.includes('-z') ? result.stdout : result.stdout.trim();
  };
  if (path.resolve(git('rev-parse', '--show-toplevel')) !== path.resolve(root)) throw new Error('ATLAS 저장소 루트에서 실행해주세요.');
  if (git('branch', '--show-current') !== BRANCH) throw new Error(`현재 브랜치가 ${BRANCH}가 아닙니다. 브랜치를 자동 변경하지 않았습니다.`);
  if (!remoteAllowed(git('remote', 'get-url', 'origin'))) throw new Error('ATLAS 원본 저장소가 아닙니다. 업데이트를 중단했습니다.');
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const file = git('rev-parse', '--git-path', marker);
    // Resolve .git markers correctly for ordinary checkouts and linked worktrees.
    if (exists(path.resolve(root, file))) throw new Error('진행 중인 Git 병합/복구 작업이 있습니다. 기존 작업을 보존하고 중단했습니다.');
  }
  const before = git('rev-parse', 'HEAD');
  git('fetch', 'origin', `refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`);
  const incoming = git('rev-parse', `refs/remotes/origin/${BRANCH}`);
  if (before === incoming) return { before, after: before, changed: false, dependencyChanged: false };
  const changes = git('diff', '--name-only', '-z', before, incoming).split('\0').filter(Boolean);
  const dirty = git('diff', '--name-only', '-z', 'HEAD').split('\0').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  const collides = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  const affected = [...dirty, ...untracked].filter((file) => changes.some((change) => collides(file, change)));
  if (affected.length) throw new Error(`로컬 변경과 업데이트가 겹칩니다. 파일을 보존하고 중단했습니다:\n${affected.join('\n')}`);
  // Git calculates a merge tree without touching the checkout or starting a merge.
  // A conflict fails here, before working files can change.
  git('merge-tree', '--write-tree', before, incoming);
  git('merge', '--no-edit', incoming);
  const after = git('rev-parse', 'HEAD');
  return { before, after, changed: after !== before,
    dependencyChanged: git('diff', '--name-only', before, after).split('\n').some((file) => ['package.json', 'package-lock.json'].includes(file)) };
}


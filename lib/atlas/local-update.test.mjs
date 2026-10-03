import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { updateLocalAtlas } from './local-update.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-update-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const local = path.join(root, 'local');
  const upstream = path.join(root, 'upstream');
  fs.mkdirSync(local);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(local, 'init', '-b', 'fix/naver-rss-dedupe');
  for (const [key, value] of [['user.name', 'ATLAS fixture'], ['user.email', 'fixture@example.invalid']]) git(local, 'config', key, value);
  const write = (dir, file, content) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), content); };
  const commit = (dir, file, content) => { write(dir, file, content); git(dir, 'add', file); git(dir, 'commit', '-m', 'fixture change'); };
  commit(local, 'app.js', 'base\n');
  commit(local, 'data/원고.json', 'original draft\n');
  git(root, 'clone', local, upstream);
  for (const [key, value] of [['user.name', 'ATLAS fixture'], ['user.email', 'fixture@example.invalid']]) git(upstream, 'config', key, value);
  git(local, 'remote', 'add', 'origin', upstream);
  const update = () => updateLocalAtlas(local, { remoteAllowed: (url) => url === upstream });
  return { local, upstream, git, write, commit, update };
}

test('update preserves dirty Korean draft and untracked images while applying new code', (t) => {
  const f = fixture(t);
  f.write(f.local, 'data/원고.json', 'home changes\n');
  f.write(f.local, 'public/수호.png', 'original image bytes');
  f.commit(f.upstream, 'app.js', 'new code\n');
  const result = f.update();
  assert.equal(result.changed, true);
  assert.equal(fs.readFileSync(path.join(f.local, 'data/원고.json'), 'utf8'), 'home changes\n');
  assert.equal(fs.readFileSync(path.join(f.local, 'public/수호.png'), 'utf8'), 'original image bytes');
  assert.equal(fs.readFileSync(path.join(f.local, 'app.js'), 'utf8'), 'new code\n');
  assert.equal(f.update().changed, false);
});

test('diverged home commit is preserved in a conflict-free merge', (t) => {
  const f = fixture(t);
  f.commit(f.local, 'home.txt', 'home saved work');
  const home = f.git(f.local, 'rev-parse', 'HEAD');
  f.commit(f.upstream, 'app.js', 'new code\n');
  const upstream = f.git(f.upstream, 'rev-parse', 'HEAD');
  f.update();
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD^1'), home);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD^2'), upstream);
  assert.equal(fs.readFileSync(path.join(f.local, 'home.txt'), 'utf8'), 'home saved work');
});

test('conflicting committed edits fail before merge and preserve dirty data', (t) => {
  const f = fixture(t);
  f.commit(f.local, 'app.js', 'home code\n');
  f.commit(f.upstream, 'app.js', 'different upstream code\n');
  f.write(f.local, 'data/원고.json', 'pending draft');
  const before = f.git(f.local, 'rev-parse', 'HEAD');
  assert.throws(f.update);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), before);
  assert.equal(fs.existsSync(path.join(f.local, '.git/MERGE_HEAD')), false);
  assert.equal(fs.readFileSync(path.join(f.local, 'data/원고.json'), 'utf8'), 'pending draft');
});

test('overlapping dirty and untracked files are preserved, including Korean filenames', (t) => {
  const f = fixture(t);
  f.commit(f.upstream, 'data/원고.json', 'remote draft');
  f.write(f.local, 'data/원고.json', 'home draft');
  assert.throws(f.update, /로컬 변경/);
  assert.equal(fs.readFileSync(path.join(f.local, 'data/원고.json'), 'utf8'), 'home draft');
  f.git(f.local, 'restore', 'data/원고.json'); // Fixture cleanup only, never updater behavior.
  f.commit(f.upstream, 'public/수호.png', 'remote image');
  f.write(f.local, 'public/수호.png', 'home image');
  assert.throws(f.update, /로컬 변경/);
  assert.equal(fs.readFileSync(path.join(f.local, 'public/수호.png'), 'utf8'), 'home image');
});

test('wrong branch, foreign remote, and unfinished merge all block update', (t) => {
  const f = fixture(t);
  assert.throws(() => updateLocalAtlas(f.local), /원본 저장소/);
  f.git(f.local, 'switch', '-c', 'main');
  assert.throws(f.update, /현재 브랜치/);
  f.git(f.local, 'switch', 'fix/naver-rss-dedupe');
  f.write(f.local, '.git/MERGE_HEAD', `${f.git(f.local, 'rev-parse', 'HEAD')}\n`);
  assert.throws(f.update, /진행 중인 Git/);
});

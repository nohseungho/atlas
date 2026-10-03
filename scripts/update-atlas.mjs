import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { updateLocalAtlas } from '../lib/atlas/local-update.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const occupied = await new Promise((resolve) => {
  const socket = net.createConnection({ host: '127.0.0.1', port: 3002 });
  socket.setTimeout(2000);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => { socket.destroy(); resolve(false); });
  socket.once('timeout', () => { socket.destroy(); resolve(true); });
});
try {
  if (occupied) throw new Error('3002 서버가 실행 중입니다. 기존 ATLAS 실행 창을 닫은 뒤 업데이트를 다시 실행해주세요. 실행 중인 프로그램은 종료하지 않았습니다.');
  console.log('ATLAS 최신 코드 확인 중… 원고·이미지·로그인 프로필을 보존합니다.');
  const result = updateLocalAtlas(root);
  const pending = path.join(root, '.atlas', 'update-dependencies-pending');
  if (result.dependencyChanged || existsSync(pending) || !existsSync(path.join(root, 'node_modules/next/dist/bin/next'))) {
    mkdirSync(path.dirname(pending), { recursive: true });
    writeFileSync(pending, result.after);
    console.log('필요한 실행 패키지를 설치합니다…');
    const install = spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32' ? ['/d', '/c', 'npm.cmd ci'] : ['ci'], { cwd: root, stdio: 'inherit' });
    if (install.error || install.status !== 0) throw new Error('패키지 설치에 실패했습니다. 업데이트 코드는 보존됐으며 ATLAS를 시작하지 않았습니다.');
    rmSync(pending, { force: true });
  }
  console.log(`${result.changed ? '업데이트 완료' : '최신 코드입니다'} · ${result.after.slice(0, 12)}`);
  console.log('ATLAS를 실행합니다. 네이버/Blogger 발행은 실행하지 않습니다.');
} catch (error) {
  console.error(`ATLAS 업데이트 중단: ${error.message}`);
  process.exitCode = 1;
}

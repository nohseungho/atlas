import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function tests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? tests(file) : entry.name.endsWith('.test.mjs') ? [file] : [];
  });
}
const result = spawnSync(process.execPath, ['--test', ...tests('lib').sort()], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

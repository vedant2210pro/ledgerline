import { spawn } from 'node:child_process';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['server/src/local.ts'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
    {
      cwd: fileURLToPath(new URL('../client/', import.meta.url)),
      stdio: 'inherit',
      windowsHide: true,
    },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
}
for (const c of children) {
  c.on('error', () => {
    stop();
    process.exitCode = 1;
  });
  c.on('exit', (code) => {
    stop();
    if (code) process.exitCode = code;
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

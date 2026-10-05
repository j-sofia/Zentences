import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
const port = Number(process.env.PORT ?? 3210);
const url = `http://localhost:${port}`;
const alreadyRunning = await fetch(`${url}/api/bootstrap`, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false);
if (alreadyRunning) {
  console.log(`Zentences is already running at ${url}`);
  if (process.env.NO_OPEN !== '1') execFile('open', [url]);
  process.exit(0);
}
await run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'inherit'],
});
let opened = false;
server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (!opened && String(chunk).includes('is ready')) {
    opened = true;
    if (process.env.NO_OPEN !== '1')
      execFile('open', [url], (error) => {
        if (error) console.log(`Open ${url} in your browser.`);
      });
  }
});
server.on('exit', (code) => process.exit(code ?? 0));
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));

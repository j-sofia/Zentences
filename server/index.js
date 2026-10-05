import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { Store } from './store.js';
import { ModelClient } from './model.js';
import { LocalRuntime } from './runtime.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const development = process.argv.includes('--dev');
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be between 1024 and 65535.');
const store = new Store(path.join(root, 'data'));
await store.init();
const client = new ModelClient();
const runtime = new LocalRuntime(root, client);
const app = await createApp({ root, store, modelClient: client, runtime, development });
let vite;
if (development) {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Zentences is ready at http://localhost:${port}`),
);
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE')
    console.error(
      `Port ${port} is in use. Open http://localhost:${port} if Zentences is already running, or start with PORT=3211 npm start.`,
    );
  else console.error('Could not start Zentences:', error.message);
  process.exitCode = 1;
});
async function stop() {
  server.close();
  await vite?.close();
  runtime.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

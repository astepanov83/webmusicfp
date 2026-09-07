#!/usr/bin/env node
// Entry point. Reads settings from the environment and starts listening.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './lib/app.js';
import { createCatalog } from './lib/catalog.js';
import { createStateStore } from './lib/state.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8421);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS || 24);
const SITE_URL = process.env.SITE_URL || 'https://musicforprogramming.net';

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const catalog = createCatalog({ dataDir: DATA_DIR, baseUrl: SITE_URL, log });
const state = createStateStore({ dataDir: DATA_DIR });

await catalog.load();
await state.load();

const server = http.createServer(createApp({ catalog, state, log }));
server.listen(PORT, HOST, () => {
  log(`webmusicfp listening on http://${HOST}:${PORT}  (${catalog.status().count} episodes cached, data in ${DATA_DIR})`);
});

// Refresh in the background when the cache is missing or old, then check again every hour.
const maxAge = REFRESH_HOURS * 3600_000;
function maybeRefresh() {
  if (!catalog.isStale(maxAge)) return;
  catalog.refresh().then((r) => log(`refresh done: ${JSON.stringify(r)}`)).catch(() => {});
}
maybeRefresh();
setInterval(maybeRefresh, 3600_000).unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log(`${sig} received, shutting down`);
    await state.flush();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

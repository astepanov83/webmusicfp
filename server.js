#!/usr/bin/env node
// Entry point. A static file server for public/. The episode list is a file
// there, written by scripts/refresh.js.

import http from 'node:http';
import { createApp } from './lib/app.js';

const PORT = Number(process.env.PORT || 8421);
const HOST = process.env.HOST || '127.0.0.1';

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const server = http.createServer(createApp());
server.listen(PORT, HOST, () => log(`webmusicfp listening on http://${HOST}:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

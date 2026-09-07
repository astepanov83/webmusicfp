#!/usr/bin/env node
// Scrape the site into data/episodes.json from the command line.
//   node scripts/refresh.js          # only new episodes
//   node scripts/refresh.js --full   # everything

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../lib/catalog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = createCatalog({ dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'), log: console.log });
await catalog.load();
const r = await catalog.refresh({ full: process.argv.includes('--full') });
console.log(`done: ${JSON.stringify(r)}`);

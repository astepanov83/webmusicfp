#!/usr/bin/env node
// Scrape the site into public/episodes.json. Run it by hand or from a timer.
//   node scripts/refresh.js          # only new episodes
//   node scripts/refresh.js --full   # everything
// EPISODES_FILE overrides the output path.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../lib/catalog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.EPISODES_FILE || path.join(ROOT, 'public', 'episodes.json');
const catalog = createCatalog({ file, baseUrl: process.env.SITE_URL || 'https://musicforprogramming.net', log: console.log });
await catalog.load();
const r = await catalog.refresh({ full: process.argv.includes('--full') });
console.log(`done: ${JSON.stringify(r)} -> ${file}`);

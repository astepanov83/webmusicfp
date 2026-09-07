// Episode catalog: scrapes the site and keeps the result in a JSON file.

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSlugs, parseEntry } from './scrape.js';

const UA = 'webmusicfp/1.0 (+local player)';

export function createCatalog({ file, baseUrl = 'https://musicforprogramming.net', fetchImpl = fetch, concurrency = 4, log = () => {} }) {
  if (!file) throw new Error('file is required');
  let data = { fetchedAt: 0, episodes: [] };
  let refreshing = null;
  let lastError = null;

  async function load() {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (Array.isArray(parsed.episodes)) data = parsed;
    } catch (err) {
      if (err.code !== 'ENOENT') log(`could not read ${file}: ${err.message}`);
    }
    return data;
  }

  async function save() {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 1));
    await fs.rename(tmp, file);
  }

  async function getText(url) {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.text();
  }

  async function fetchEpisode(slug) {
    const ep = parseEntry(await getText(`${baseUrl}/${slug}`));
    if (!ep) throw new Error(`${slug}: no episode data on page`);
    return ep;
  }

  // Run fn over items with at most `concurrency` in flight. Failures are collected, not thrown.
  async function mapLimited(items, fn) {
    const results = [];
    const errors = [];
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const item = items[i++];
        try {
          results.push(await fn(item));
        } catch (err) {
          errors.push({ item, error: err.message });
          log(`skip ${item}: ${err.message}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return { results, errors };
  }

  async function doRefresh({ full = false } = {}) {
    const latestHtml = await getText(`${baseUrl}/latest`);
    const slugs = parseSlugs(latestHtml);
    if (!slugs.length) throw new Error('no episode slugs found on /latest');

    const known = new Map(data.episodes.map((e) => [e.slug, e]));
    const latest = parseEntry(latestHtml);
    if (latest) known.set(latest.slug, latest);

    const wanted = full ? slugs : slugs.filter((s) => !known.has(s));
    log(`refresh: ${slugs.length} episodes on site, fetching ${wanted.length}`);
    const { results, errors } = await mapLimited(wanted, fetchEpisode);
    for (const ep of results) known.set(ep.slug, ep);

    const episodes = slugs.map((s) => known.get(s)).filter(Boolean);
    episodes.sort((a, b) => b.number - a.number);
    data = { fetchedAt: Date.now(), episodes };
    await save();
    return { fetched: results.length, failed: errors.length, total: episodes.length };
  }

  // Only one refresh runs at a time; callers share it.
  function refresh(opts) {
    if (!refreshing) {
      refreshing = doRefresh(opts)
        .then((r) => { lastError = null; return r; })
        .catch((err) => { lastError = err.message; log(`refresh failed: ${err.message}`); throw err; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  function isStale(maxAgeMs) {
    return !data.episodes.length || Date.now() - data.fetchedAt > maxAgeMs;
  }

  return {
    load,
    refresh,
    isStale,
    get: () => data,
    find: (slug) => data.episodes.find((e) => e.slug === slug) || null,
    status: () => ({ fetchedAt: data.fetchedAt, count: data.episodes.length, refreshing: !!refreshing, lastError }),
  };
}

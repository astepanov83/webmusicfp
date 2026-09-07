// Parsers for musicforprogramming.net pages. Pure functions, no network.

import vm from 'node:vm';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', hellip: '…', ndash: '–', mdash: '—' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

// Episode slugs are written as words: one, two, ... seventynine. The hidden nav also
// links to about/credits/rss, which are not episodes.
const NOT_EPISODES = new Set(['about', 'credits', 'latest']);

export function parseSlugs(html) {
  const out = [];
  const seen = new Set();
  const re = /<a href=([a-z]+)>(\d+): /g;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1];
    if (NOT_EPISODES.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function parseDuration(text) {
  if (!text) return 0;
  const parts = String(text).trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseTracklist(text) {
  if (!text) return [];
  return String(text)
    .split(/<br\s*\/?>/i)
    .map((l) => decodeEntities(l.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(' - ');
      if (i < 0) return { artist: '', title: line, line };
      return { artist: line.slice(0, i).trim(), title: line.slice(i + 3).trim(), line };
    });
}

export function parseLinks(html) {
  if (!html) return [];
  const out = [];
  const re = /href=["']?([^"'\s>]+)/gi;
  let m;
  while ((m = re.exec(html))) out.push(decodeEntities(m[1]));
  return out;
}

// The page embeds `__SAPPER__={...preloaded:[void 0,{entry:{...}}]}` as a JS literal
// (unquoted keys, / escapes, sometimes wrapped in an IIFE). Run it in an empty
// vm context and take the entry object out.
function readSapper(html) {
  const start = html.indexOf('__SAPPER__=');
  if (start < 0) return null;
  const end = html.indexOf(';if(', start);
  const src = html.slice(start, end > start ? end : undefined);
  const ctx = {};
  try {
    vm.runInNewContext(src, ctx, { timeout: 1000 });
  } catch {
    return null;
  }
  const preloaded = ctx.__SAPPER__?.preloaded;
  if (!Array.isArray(preloaded)) return null;
  for (const p of preloaded) if (p && p.entry) return p.entry;
  return null;
}

function toIso(ts) {
  // "2011-02-22 17:17:58" -> "2011-02-22T17:17:58Z" (the site is UTC)
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(String(ts || '').trim());
  return m ? `${m[1]}T${m[2]}Z` : null;
}

export function parseEntry(html) {
  const e = readSapper(html);
  if (!e || e.type !== 'episode' || !e.file) return null;
  const title = decodeEntities(e.title || '');
  const artist = title.replace(/^\d+:\s*/, '');
  return {
    slug: e.slug,
    number: Number(e.order) || 0,
    title,
    artist,
    url: e.file,
    bytes: Number(e.filesize) || 0,
    duration: parseDuration(e.duration),
    durationText: e.duration || '',
    date: toIso(e.timestamp),
    tracks: parseTracklist(e.tracklist),
    links: parseLinks(e.links),
  };
}

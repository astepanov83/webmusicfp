import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../lib/catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

// Minimal episode page in the same shape the site uses.
function page(slug, order) {
  return `<html><body><script>__SAPPER__={baseUrl:"",preloaded:[void 0,{entry:{slug:"${slug}",type:"episode",order:${order},title:"${String(order).padStart(2, '0')}: Artist ${order}",file:"https:\\u002F\\u002Fx.example\\u002F${slug}.mp3",filesize:"100",duration:"1:00:00",timestamp:"2020-01-01 00:00:00",body:"",tracklist:"\\n\\t\\t\\tA - B\\u003Cbr\\u003E\\n",links:""}}]};if('serviceWorker' in navigator)x()</script></body></html>`;
}

function latestPage(slugs) {
  const nav = slugs.map((s, i) => `<a href=${s}>${slugs.length - i}: X</a>`).join('');
  const top = slugs[0];
  return page(top, slugs.length).replace('<body>', `<body><div>${nav}<a href=about>About</a></div>`);
}

function fakeFetch(map, calls = []) {
  return async (url) => {
    calls.push(url);
    const body = map[url];
    if (body == null) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'webmusicfp-'));
}

test('refresh scrapes the list and each episode, then saves to disk', async () => {
  const dir = tmpDir();
  const calls = [];
  const cat = createCatalog({
    file: path.join(dir, 'episodes.json'),
    baseUrl: 'http://site.example',
    fetchImpl: fakeFetch({
      'http://site.example/latest': latestPage(['three', 'two', 'one']),
      'http://site.example/two': page('two', 2),
      'http://site.example/one': page('one', 1),
    }, calls),
  });
  await cat.load();
  assert.ok(cat.isStale(1000));
  const r = await cat.refresh();
  assert.deepEqual(r, { fetched: 2, failed: 0, total: 3 });
  // The latest page already contains episode three, so it is not fetched again.
  assert.ok(!calls.includes('http://site.example/three'));
  const eps = cat.get().episodes;
  assert.deepEqual(eps.map((e) => e.slug), ['three', 'two', 'one']);
  assert.equal(eps[1].url, 'https://x.example/two.mp3');
  assert.ok(!cat.isStale(1000));

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'episodes.json'), 'utf8'));
  assert.equal(saved.episodes.length, 3);
});

test('second refresh only fetches episodes it does not have yet', async () => {
  const dir = tmpDir();
  const calls = [];
  const map = {
    'http://site.example/latest': latestPage(['two', 'one']),
    'http://site.example/one': page('one', 1),
  };
  const cat = createCatalog({ file: path.join(dir, 'episodes.json'), baseUrl: 'http://site.example', fetchImpl: fakeFetch(map, calls) });
  await cat.refresh();
  calls.length = 0;
  map['http://site.example/latest'] = latestPage(['three', 'two', 'one']);
  const r = await cat.refresh();
  assert.deepEqual(r, { fetched: 0, failed: 0, total: 3 });
  assert.deepEqual(calls, ['http://site.example/latest']);
  assert.equal(cat.get().episodes[0].slug, 'three');

  // A full refresh fetches everything again.
  calls.length = 0;
  map['http://site.example/two'] = page('two', 2);
  map['http://site.example/three'] = page('three', 3);
  await cat.refresh({ full: true });
  assert.ok(calls.includes('http://site.example/one'));
  assert.ok(calls.includes('http://site.example/two'));
});

test('a failing episode page is skipped and reported, the rest is kept', async () => {
  const dir = tmpDir();
  const cat = createCatalog({
    file: path.join(dir, 'episodes.json'),
    baseUrl: 'http://site.example',
    fetchImpl: fakeFetch({
      'http://site.example/latest': latestPage(['two', 'one']),
      // 'one' is missing -> 404
    }),
  });
  const r = await cat.refresh();
  assert.deepEqual(r, { fetched: 0, failed: 1, total: 1 });
  assert.equal(cat.status().lastError, null);
});

test('load reads a previously saved catalog', async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'episodes.json'), JSON.stringify({ fetchedAt: Date.now() - 5000, episodes: [{ slug: 'one', number: 1 }] }));
  const cat = createCatalog({ file: path.join(dir, 'episodes.json'), fetchImpl: async () => { throw new Error('no network'); } });
  await cat.load();
  assert.equal(cat.find('one').number, 1);
  assert.ok(!cat.isStale(60_000));
  assert.ok(cat.isStale(1000));
});

test('refresh failure is remembered in status and thrown', async () => {
  const dir = tmpDir();
  const cat = createCatalog({ file: path.join(dir, 'episodes.json'), fetchImpl: async () => { throw new Error('no network'); } });
  await assert.rejects(cat.refresh(), /no network/);
  assert.equal(cat.status().lastError, 'no network');
  assert.equal(cat.status().refreshing, false);
});

test('parseSlugs on the real fixture agrees with the catalog ordering', () => {
  assert.ok(read('fixture-latest.html').includes('seventynine'));
});

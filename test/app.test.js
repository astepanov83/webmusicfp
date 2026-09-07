import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../lib/app.js';
import { createStateStore } from '../lib/state.js';

function fakeCatalog(episodes = []) {
  let refreshCalls = [];
  return {
    calls: refreshCalls,
    get: () => ({ fetchedAt: 123, episodes }),
    find: (slug) => episodes.find((e) => e.slug === slug) || null,
    status: () => ({ fetchedAt: 123, count: episodes.length, refreshing: false, lastError: null }),
    refresh: async (opts) => { refreshCalls.push(opts); return { fetched: 1, failed: 0, total: episodes.length }; },
  };
}

async function withServer(opts, fn) {
  const server = http.createServer(createApp(opts));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

function makeOpts() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webmusicfp-app-'));
  const catalog = fakeCatalog([
    { slug: 'two', number: 2, title: '02: B', tracks: [] },
    { slug: 'one', number: 1, title: '01: A', tracks: [] },
  ]);
  return { catalog, state: createStateStore({ dataDir: dir }) };
}

test('GET / serves the player page', async () => {
  await withServer(makeOpts(), async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<title>/);
  });
});

test('static files cannot escape public/', async () => {
  await withServer(makeOpts(), async (base) => {
    const res = await fetch(base + '/..%2F..%2Fpackage.json');
    assert.ok(res.status === 403 || res.status === 404);
    const res2 = await fetch(base + '/%zz');
    assert.equal(res2.status, 400);
  });
});

test('GET /api/episodes returns the catalog', async () => {
  await withServer(makeOpts(), async (base) => {
    const res = await fetch(base + '/api/episodes');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.fetchedAt, 123);
    assert.equal(body.episodes.length, 2);
    assert.equal(body.status.count, 2);
  });
});

test('GET /api/episodes/:slug returns one or 404', async () => {
  await withServer(makeOpts(), async (base) => {
    const ok = await fetch(base + '/api/episodes/one');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).number, 1);
    const miss = await fetch(base + '/api/episodes/zzz');
    assert.equal(miss.status, 404);
  });
});

test('POST /api/refresh triggers a refresh, ?full=1 is passed on', async () => {
  const opts = makeOpts();
  await withServer(opts, async (base) => {
    const res = await fetch(base + '/api/refresh', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).fetched, 1);
    await fetch(base + '/api/refresh?full=1', { method: 'POST' });
    assert.deepEqual(opts.catalog.calls, [{ full: false }, { full: true }]);
  });
});

test('PUT /api/state stores state, GET reads it back', async () => {
  const opts = makeOpts();
  await withServer(opts, async (base) => {
    const put = await fetch(base + '/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastSlug: 'one', positions: { one: 99 }, junk: 1 }),
    });
    assert.equal(put.status, 200);
    const got = await (await fetch(base + '/api/state')).json();
    assert.equal(got.lastSlug, 'one');
    assert.equal(got.positions.one, 99);
    assert.equal(got.junk, undefined);
    const bad = await fetch(base + '/api/state', { method: 'PUT', body: '{nope' });
    assert.equal(bad.status, 400);
  });
});

test('unknown api paths give 404 json, other methods on static give 405', async () => {
  await withServer(makeOpts(), async (base) => {
    assert.equal((await fetch(base + '/api/nope')).status, 404);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  });
});

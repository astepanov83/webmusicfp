import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSlugs, parseEntry, parseTracklist, parseDuration, parseLinks, decodeEntities } from '../lib/scrape.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

test('parseSlugs finds every episode slug in order, newest first', () => {
  const slugs = parseSlugs(read('fixture-latest.html'));
  assert.equal(slugs.length, 79);
  assert.equal(slugs[0], 'seventynine');
  assert.equal(slugs[78], 'one');
  assert.ok(!slugs.includes('about'));
  assert.ok(!slugs.includes('credits'));
});

test('parseEntry reads the embedded episode object', () => {
  const ep = parseEntry(read('fixture-one.html'));
  assert.equal(ep.slug, 'one');
  assert.equal(ep.number, 1);
  assert.equal(ep.title, '01: Datassette');
  assert.equal(ep.artist, 'Datassette');
  assert.equal(ep.url, 'https://datashat.net/music_for_programming_1-datassette.mp3');
  assert.equal(ep.bytes, 88368647);
  assert.equal(ep.duration, 3736);
  assert.equal(ep.durationText, '1:02:16');
  assert.equal(ep.date, '2011-02-22T17:17:58Z');
  assert.equal(ep.tracks.length, 14);
  assert.deepEqual(ep.tracks[0], { artist: 'Frog Pocket', title: 'Plinty', line: 'Frog Pocket - Plinty' });
  assert.deepEqual(ep.tracks[12], { artist: 'Der Zyklus', title: 'Iris / Retinal Scanning', line: 'Der Zyklus - Iris / Retinal Scanning' });
  assert.ok(ep.links.length >= 1);
  assert.match(ep.links[0], /^https?:\/\//);
});

test('parseEntry on the latest page gives the newest episode', () => {
  const ep = parseEntry(read('fixture-latest.html'));
  assert.equal(ep.slug, 'seventynine');
  assert.equal(ep.number, 79);
  assert.equal(ep.duration, 4 * 3600);
  assert.equal(ep.tracks[0].artist, '아버지');
});

test('parseEntry returns null for non-episode pages', () => {
  assert.equal(parseEntry(read('fixture-about.html')), null);
  assert.equal(parseEntry('<html>no data</html>'), null);
});

test('parseTracklist splits lines and artist/title', () => {
  const tracks = parseTracklist('\n\t\t\tA - B<br>\n\t\t\tOrrest - een&deg;dag<br>\n\t\t\tJust A Line<br>\n\t\t');
  assert.deepEqual(tracks, [
    { artist: 'A', title: 'B', line: 'A - B' },
    { artist: 'Orrest', title: 'een°dag', line: 'Orrest - een°dag' },
    { artist: '', title: 'Just A Line', line: 'Just A Line' },
  ]);
});

test('parseDuration handles h:m:s and m:s', () => {
  assert.equal(parseDuration('1:02:16'), 3736);
  assert.equal(parseDuration('4:00:00'), 14400);
  assert.equal(parseDuration('59:30'), 3570);
  assert.equal(parseDuration(''), 0);
  assert.equal(parseDuration(undefined), 0);
});

test('parseLinks pulls hrefs out of link html', () => {
  assert.deepEqual(parseLinks('<a target="_blank" href="https://x.example/">https://x.example/</a><br><a href=\'http://y.example\'>y</a>'), [
    'https://x.example/',
    'http://y.example',
  ]);
  assert.deepEqual(parseLinks(''), []);
});

test('decodeEntities covers the common cases', () => {
  assert.equal(decodeEntities('a &amp; b &#039;c&#x27; &deg; &lt;x&gt;'), "a & b 'c' ° <x>");
});

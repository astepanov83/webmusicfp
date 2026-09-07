// Music For Programming player. Plain browser JS, no build step.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('app'), catalogInfo: $('catalogInfo'), refreshBtn: $('refreshBtn'), themeToggle: $('themeToggle'), helpBtn: $('helpBtn'), help: $('help'),
    filter: $('filter'), filterCount: $('filterCount'), list: $('episodeList'), listEmpty: $('listEmpty'),
    detail: $('detail'), backBtn: $('backBtn'), detailEmpty: $('detailEmpty'), detailBody: $('detailBody'), dNumber: $('dNumber'), dTitle: $('dTitle'), dMeta: $('dMeta'),
    dPlay: $('dPlay'), dRestart: $('dRestart'), dFinished: $('dFinished'), dSite: $('dSite'), dFile: $('dFile'), dLinks: $('dLinks'),
    dTrackCount: $('dTrackCount'), tracks: $('tracks'),
    barArt: $('barArt'), barTitle: $('barTitle'), barSub: $('barSub'),
    prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), back10: $('back10'), fwd30: $('fwd30'), playBtn: $('playBtn'),
    tElapsed: $('tElapsed'), tRemaining: $('tRemaining'), seek: $('seek'), seekTrack: $('seekTrack'), seekBuffered: $('seekBuffered'),
    seekPlayed: $('seekPlayed'), seekThumb: $('seekThumb'), seekTip: $('seekTip'),
    continueMode: $('continueMode'), speed: $('speed'), sleep: $('sleep'), muteBtn: $('muteBtn'), volume: $('volume'),
    toast: $('toast'), audio: $('audio'),
    vizToggle: $('vizToggle'), viz: $('viz'), stage: $('stage'), bigPlay: $('bigPlay'),
  };
  const audio = el.audio;
  const SITE = 'https://musicforprogramming.net';
  const ART = `${SITE}/img/folder.jpg`;

  // ---------- state ----------
  let episodes = [];          // newest first
  let bySlug = new Map();
  let state = { lastSlug: null, positions: {}, finished: {} };
  let selected = null;        // slug shown in the detail pane
  let playing = null;         // slug loaded in the audio element
  let filterText = '';
  let showTotal = false;      // remaining vs total time toggle
  let seekDragging = false;
  let sleepTimer = null, sleepAt = 0, fadeTimer = null;
  let lastSavedPos = 0;

  const prefs = {
    get(k, d) { try { const v = localStorage.getItem('mfp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('mfp.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- helpers ----------
  function fmtTime(s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtBytes(b) { return b ? Math.round(b / 1048576) + ' MB' : ''; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  let toastTimer = null;
  function toast(msg, isError = false) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('error', isError);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), isError ? 5000 : 2500);
  }

  async function getJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.json();
  }

  // ---------- server state (positions, finished) ----------
  let saveTimer = null;
  function saveStateSoon(delay = 800) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, delay);
  }
  function saveState(keepalive = false) {
    clearTimeout(saveTimer);
    return fetch('/api/state', {
      method: 'PUT', keepalive,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {});
  }

  function positionOf(slug) { return state.positions[slug] || 0; }
  function isFinished(slug) { return !!state.finished[slug]; }
  // The site publishes no timestamps, so tracks are spread evenly over the file.
  function trackTimes(slug) {
    const ep = bySlug.get(slug);
    if (!ep) return [];
    const n = ep.tracks.length;
    const dur = (playing === slug && audio.duration) || ep.duration || 0;
    return Array.from({ length: n }, (_, i) => (dur * i) / n);
  }
  function trackAt(slug, t) {
    const times = trackTimes(slug);
    let best = -1;
    for (let i = 0; i < times.length; i++) if (times[i] <= t + 0.05) best = i;
    return best;
  }

  function rememberPosition(force = false) {
    if (!playing || !Number.isFinite(audio.currentTime)) return;
    const t = audio.currentTime;
    if (!force && Math.abs(t - lastSavedPos) < 5) return;
    lastSavedPos = t;
    if (t < 5) delete state.positions[playing];
    else state.positions[playing] = Math.round(t);
    updateRowProgress(playing);
    saveStateSoon(force ? 0 : 1500);
  }

  // ---------- episodes ----------
  function matches(ep, q) {
    if (!q) return { ok: true };
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const head = `${ep.number} ${pad2(ep.number)} ${ep.artist} ${ep.title}`.toLowerCase();
    if (words.every((w) => head.includes(w))) return { ok: true };
    const t = ep.tracks.find((tr) => { const l = tr.line.toLowerCase(); return words.every((w) => l.includes(w)); });
    return t ? { ok: true, track: t } : { ok: false };
  }

  function renderList() {
    const q = filterText.trim();
    el.list.textContent = '';
    let shown = 0;
    const frag = document.createDocumentFragment();
    for (const ep of episodes) {
      const m = matches(ep, q);
      if (!m.ok) continue;
      shown++;
      const li = document.createElement('li');
      li.className = 'ep';
      li.dataset.slug = ep.slug;
      if (ep.slug === selected) li.classList.add('selected');
      if (ep.slug === playing) li.classList.add('playing');
      if (isFinished(ep.slug)) li.classList.add('finished');
      const hint = m.track
        ? `<div class="ep-hint">track: <b>${esc(m.track.line)}</b></div>`
        : `<div class="ep-hint">${esc(fmtDate(ep.date))}</div>`;
      li.innerHTML = `
        <div class="ep-num mono">${pad2(ep.number)}<button class="ep-play" title="Play episode ${ep.number}" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button></div>
        <div class="ep-main"><div class="ep-artist">${esc(ep.artist)}</div>${hint}</div>
        <div class="ep-side"><span class="ep-dur mono">${esc(ep.durationText)}</span><span class="ep-flag"></span></div>
        <div class="ep-progress"><i></i></div>`;
      frag.appendChild(li);
    }
    el.list.appendChild(frag);
    for (const ep of episodes) updateRowProgress(ep.slug);
    el.listEmpty.hidden = shown > 0;
    el.filterCount.textContent = q ? `${shown} / ${episodes.length}` : `${episodes.length}`;
  }

  function rowOf(slug) { return el.list.querySelector(`.ep[data-slug="${slug}"]`); }

  function updateRowProgress(slug) {
    const row = rowOf(slug);
    const ep = bySlug.get(slug);
    if (!row || !ep) return;
    const pos = positionOf(slug);
    const fin = isFinished(slug);
    row.classList.toggle('finished', fin);
    row.querySelector('.ep-progress > i').style.width = ep.duration ? `${clamp(pos / ep.duration * 100, 0, 100)}%` : '0';
    const flag = row.querySelector('.ep-flag');
    flag.textContent = fin ? 'done' : pos > 0 ? `at ${fmtTime(pos)}` : '';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- detail pane ----------
  function select(slug, { scroll = false } = {}) {
    const ep = bySlug.get(slug);
    if (!ep) return;
    const prev = selected;
    selected = slug;
    if (prev) rowOf(prev)?.classList.remove('selected');
    const row = rowOf(slug);
    row?.classList.add('selected');
    if (scroll && row) row.scrollIntoView({ block: 'nearest' });
    el.app.classList.add('show-detail');
    renderDetail();
  }

  function renderDetail() {
    const ep = bySlug.get(selected);
    el.detailEmpty.hidden = !!ep;
    el.detailBody.hidden = !ep;
    if (!ep) return;
    el.dNumber.textContent = `Episode ${ep.number} of ${episodes.length}`;
    el.dTitle.textContent = ep.artist;
    el.dMeta.innerHTML = [
      fmtDate(ep.date),
      ep.durationText,
      fmtBytes(ep.bytes),
      `${ep.tracks.length} tracks`,
    ].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
    el.dSite.href = `${SITE}/${ep.slug}`;
    el.dFile.href = ep.url;
    el.dLinks.innerHTML = ep.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`).join('');
    el.dTrackCount.textContent = `(${ep.tracks.length})`;
    updateDetailButtons();
    renderTracks();
    updateStage();
    el.detail.scrollTop = 0;
  }

  function updateDetailButtons() {
    const ep = bySlug.get(selected);
    if (!ep) return;
    const pos = positionOf(ep.slug);
    const isPlayingThis = playing === ep.slug && !audio.paused;
    el.dPlay.textContent = isPlayingThis ? 'Pause' : pos > 0 && playing !== ep.slug ? `Resume ${fmtTime(pos)}` : 'Play';
    el.dRestart.hidden = !(pos > 0 || playing === ep.slug);
    el.dFinished.textContent = isFinished(ep.slug) ? 'Finished ✓' : 'Mark finished';
    el.dFinished.classList.toggle('on', isFinished(ep.slug));
  }

  function renderTracks() {
    const ep = bySlug.get(selected);
    el.tracks.textContent = '';
    if (!ep) return;
    const times = trackTimes(ep.slug);
    const frag = document.createDocumentFragment();
    ep.tracks.forEach((tr, i) => {
      const li = document.createElement('li');
      li.className = 'track';
      li.dataset.idx = i;
      li.innerHTML = `
        <span class="track-idx mono">${i + 1}</span>
        <div class="track-main">
          <div class="track-title">${esc(tr.title)}</div>
          ${tr.artist ? `<div class="track-artist">${esc(tr.artist)}</div>` : ''}
        </div>
        <span class="track-time mono" title="Approximate start">${fmtTime(times[i])}</span>`;
      frag.appendChild(li);
    });
    el.tracks.appendChild(frag);
    updateNowTrack(true);
  }

  function updateNowTrack(force = false) {
    if (selected !== playing) {
      el.tracks.querySelectorAll('.track.now').forEach((n) => n.classList.remove('now'));
      return;
    }
    const idx = trackAt(playing, currentTime());
    const cur = el.tracks.querySelector('.track.now');
    if (!force && cur && Number(cur.dataset.idx) === idx) return;
    cur?.classList.remove('now');
    if (idx >= 0) el.tracks.querySelector(`.track[data-idx="${idx}"]`)?.classList.add('now');
  }

  // Previous / next track, like a playlist. Past the last track it rolls into the
  // next episode. "Previous" restarts the current track unless it just began.
  function stepTrack(dir) {
    if (!playing) { if (selected) play(selected); return; }
    const times = trackTimes(playing);
    const t = currentTime();
    const cur = Math.max(0, trackAt(playing, t));
    let target = dir > 0 ? cur + 1 : (t - times[cur] > 3 ? cur : cur - 1);
    if (target >= times.length) {
      const next = neighbour(1);
      if (!next) { toast('Last track of the oldest episode'); return; }
      select(next, { scroll: true });
      play(next, { startAt: 0 });
      return;
    }
    if (target < 0) target = 0;
    play(playing, { startAt: times[target] });
  }

  // ---------- playback ----------
  function load(slug, { startAt = null } = {}) {
    const ep = bySlug.get(slug);
    if (!ep) return false;
    if (playing && playing !== slug) rememberPosition(true);
    const prevRow = playing && rowOf(playing);
    playing = slug;
    state.lastSlug = slug;
    prevRow?.classList.remove('playing');
    rowOf(slug)?.classList.add('playing');
    pendingSeek = null;
    audio.src = ep.url;
    const start = startAt != null ? startAt : positionOf(slug);
    lastSavedPos = start;
    if (start > 0) pendingSeek = start; // applied when metadata arrives
    updateTimes();
    document.title = `${ep.number} ${ep.artist} - MFP`;
    el.barArt.textContent = pad2(ep.number);
    el.barTitle.textContent = `${ep.number}: ${ep.artist}`;
    el.barSub.textContent = ep.durationText;
    setMediaSession(ep);
    updateTimes();
    updateNowTrack(true);
    updateDetailButtons();
    saveStateSoon(0);
    return true;
  }

  // Before metadata has loaded the element cannot seek, so remember the wish and
  // apply it on loadedmetadata. A later request replaces an earlier one.
  let pendingSeek = null;
  function requestSeek(t) {
    if (audio.readyState >= 1) { audio.currentTime = t; pendingSeek = null; }
    else pendingSeek = t;
    updateTimes();
  }
  function currentTime() { return pendingSeek != null ? pendingSeek : (audio.currentTime || 0); }
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek != null) { audio.currentTime = pendingSeek; pendingSeek = null; }
  });

  async function play(slug, opts) {
    if (slug && slug !== playing) load(slug, opts);
    else if (slug && opts && opts.startAt != null) requestSeek(opts.startAt);
    if (!playing) return;
    ensureAudioGraph();
    try {
      await audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') toast(`Cannot play: ${err.message}`, true);
    }
  }
  function togglePlay() {
    if (!playing) {
      const target = selected || state.lastSlug || episodes[0]?.slug;
      if (target) play(target);
      return;
    }
    if (audio.paused) play(); else audio.pause();
  }
  function seekTo(t) {
    if (!playing) return;
    const d = audio.duration || bySlug.get(playing)?.duration || 0;
    requestSeek(clamp(t, 0, d ? d - 0.5 : t));
  }
  function seekBy(dt) { seekTo(currentTime() + dt); }

  function neighbour(dir) {
    const base = playing || selected;
    const i = episodes.findIndex((e) => e.slug === base);
    if (i < 0) return episodes[0]?.slug;
    // List is newest first, so "next" walks down the list to older episodes.
    const j = i + dir;
    return episodes[j]?.slug || null;
  }
  function randomSlug() {
    const pool = episodes.filter((e) => !isFinished(e.slug) && e.slug !== playing);
    const from = pool.length ? pool : episodes;
    return from[Math.floor(Math.random() * from.length)]?.slug;
  }
  function stepEpisode(dir) {
    const slug = neighbour(dir);
    if (!slug) { toast(dir > 0 ? 'This is the oldest episode' : 'This is the newest episode'); return; }
    const wasPlaying = !audio.paused && playing;
    select(slug, { scroll: true });
    if (wasPlaying || playing) play(slug);
  }

  function onEnded() {
    if (!playing) return;
    state.finished[playing] = true;
    delete state.positions[playing];
    updateRowProgress(playing);
    updateDetailButtons();
    saveStateSoon(0);
    const mode = el.continueMode.value;
    const next = mode === 'next' ? neighbour(1) : mode === 'random' ? randomSlug() : null;
    if (next) { select(next, { scroll: true }); play(next, { startAt: 0 }); }
    else updatePlayButton();
  }

  function updatePlayButton() {
    const isPlaying = !!playing && !audio.paused;
    el.playBtn.classList.toggle('playing', isPlaying);
    el.playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    el.barArt.classList.toggle('playing', isPlaying);
    updateStage();
    const ep = bySlug.get(playing);
    if (ep) document.title = `${isPlaying ? '▶ ' : ''}${ep.number} ${ep.artist} - MFP`;
    updateDetailButtons();
  }

  function updateTimes() {
    const ep = bySlug.get(playing);
    const d = audio.duration || ep?.duration || 0;
    const t = currentTime();
    el.tElapsed.textContent = fmtTime(t);
    el.tRemaining.textContent = showTotal ? fmtTime(d) : `-${fmtTime(Math.max(0, d - t))}`;
    const pct = d ? t / d : 0;
    if (!seekDragging) {
      el.seek.value = Math.round(pct * 1000);
      el.seekPlayed.style.width = `${pct * 100}%`;
      el.seekThumb.style.left = `${pct * 100}%`;
    }
    // Buffered: draw the range that contains the play head.
    let bl = 0, bw = 0;
    for (let i = 0; i < audio.buffered.length; i++) {
      const s = audio.buffered.start(i), e = audio.buffered.end(i);
      if (s <= t + 1 && e >= t - 1) { bl = s / d * 100; bw = (e - s) / d * 100; break; }
    }
    el.seekBuffered.style.left = `${bl}%`;
    el.seekBuffered.style.width = `${bw}%`;
    // Now playing track under the bar
    if (ep) {
      const idx = trackAt(ep.slug, t);
      el.barSub.textContent = idx >= 0 ? `${idx + 1}. ${ep.tracks[idx].line}` : ep.durationText;
    }
  }

  // ---------- media session ----------
  function setMediaSession(ep) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${ep.number}: ${ep.artist}`,
      artist: 'Music For Programming',
      album: 'musicforprogramming.net',
      artwork: [{ src: ART, sizes: '1024x1024', type: 'image/jpeg' }],
    });
    const h = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch { /* unsupported */ } };
    h('play', () => play());
    h('pause', () => audio.pause());
    h('seekbackward', (e) => seekBy(-(e.seekOffset || 10)));
    h('seekforward', (e) => seekBy(e.seekOffset || 30));
    h('previoustrack', () => stepTrack(-1));
    h('nexttrack', () => stepTrack(1));
    h('seekto', (e) => { if (e.seekTime != null) seekTo(e.seekTime); });
  }
  function updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!Number.isFinite(audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: audio.currentTime });
    } catch { /* ignore */ }
  }

  // ---------- sleep timer ----------
  function setSleep(minutes) {
    clearTimeout(sleepTimer); clearInterval(fadeTimer);
    sleepTimer = null; sleepAt = 0;
    el.sleep.parentElement.classList.toggle('armed', minutes > 0);
    if (!minutes) return;
    sleepAt = Date.now() + minutes * 60_000;
    sleepTimer = setTimeout(() => {
      const startVol = audio.volume;
      let step = 0;
      fadeTimer = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol * (1 - step / 40));
        if (step >= 40) {
          clearInterval(fadeTimer);
          audio.pause();
          audio.volume = startVol;
          el.sleep.value = '0';
          setSleep(0);
          toast('Sleep timer: paused');
        }
      }, 500);
    }, Math.max(0, minutes * 60_000 - 20_000));
  }
  setInterval(() => {
    if (!sleepAt) return;
    const left = Math.max(0, Math.round((sleepAt - Date.now()) / 60_000));
    el.sleep.title = `Sleep timer: ${left} min left`;
  }, 15_000);

  // ---------- theme ----------
  function applyTheme(t) {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
    el.themeToggle.title = `Theme: ${t} (t)`;
  }
  function cycleTheme() {
    const order = ['dark', 'light', 'system'];
    const cur = prefs.get('theme', 'dark');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    prefs.set('theme', next);
    applyTheme(next);
  }

  // ---------- volume ----------
  function applyVolume() {
    const v = Number(el.volume.value) / 100;
    audio.volume = v;
    prefs.set('volume', v);
    el.muteBtn.setAttribute('aria-pressed', String(audio.muted));
    el.muteBtn.querySelector('.ic-vol').style.display = audio.muted || v === 0 ? 'none' : '';
    el.muteBtn.querySelector('.ic-muted').style.display = audio.muted || v === 0 ? '' : 'none';
  }
  function nudgeVolume(d) {
    el.volume.value = clamp(Number(el.volume.value) + d, 0, 100);
    if (audio.muted && d > 0) audio.muted = false;
    applyVolume();
  }

  // ---------- catalog ----------
  function setEpisodes(list) {
    episodes = list.slice().sort((a, b) => b.number - a.number);
    bySlug = new Map(episodes.map((e) => [e.slug, e]));
    renderList();
    const latest = episodes[0];
    el.catalogInfo.textContent = latest ? `${episodes.length} episodes · latest ${fmtDate(latest.date)}` : 'No episodes yet';
    el.prevBtn.disabled = el.nextBtn.disabled = !episodes.length;
  }

  async function loadCatalog() {
    const data = await getJSON('/api/episodes');
    setEpisodes(data.episodes);
    if (!data.episodes.length) {
      el.catalogInfo.textContent = data.status.refreshing ? 'Fetching episodes from the site…' : data.status.lastError ? `Cannot fetch episodes: ${data.status.lastError}` : 'No episodes cached yet';
      if (!data.status.refreshing && !data.status.lastError) fetch('/api/refresh', { method: 'POST' }).catch(() => {});
      setTimeout(loadCatalog, 3000);
    }
    return data;
  }

  async function refresh(full = false) {
    el.refreshBtn.classList.add('spin');
    el.refreshBtn.disabled = true;
    const before = episodes.length;
    try {
      const r = await getJSON(`/api/refresh${full ? '?full=1' : ''}`, { method: 'POST' });
      const data = await loadCatalog();
      const added = data.episodes.length - before;
      toast(added > 0 ? `${added} new episode${added > 1 ? 's' : ''}` : r.failed ? `No new episodes (${r.failed} pages failed)` : 'No new episodes');
    } catch (err) {
      toast(`Refresh failed: ${err.message}`, true);
    } finally {
      el.refreshBtn.classList.remove('spin');
      el.refreshBtn.disabled = false;
    }
  }

  // ---------- visualizer ----------
  // A ring of bars around the big play button, mirrored left and right. Bands are
  // spaced logarithmically (equal width per octave). Levels rise at once and fall
  // slowly; peak caps hold, then drop. The dB range adapts to the material, since
  // these mixes are far quieter than a radio stream.
  let audioCtx = null;
  let analyser = null;
  let vizOn = prefs.get('viz', true);
  const ctx2d = el.viz.getContext('2d');
  let vizFrame = null;
  const BANDS = 56;
  const F_LO = 40, F_HI = 14500;
  const RELEASE = 0.86;
  const RANGE_DB = 42;          // bar length spans ceiling-42 dB .. ceiling
  const CEIL_FALL = 0.03;       // dB per frame the adaptive ceiling drifts down
  const TILT_DB = 8;
  const PEAK_HOLD = 18, PEAK_FALL = 0.012;
  const levels = new Float32Array(BANDS);
  const peaks = new Float32Array(BANDS);
  const peakHold = new Uint8Array(BANDS);
  let ceiling = -40;
  let bandEdges = null;
  let colors = { c1: '', c2: '' };

  function ensureAudioGraph() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); return; }
    if (!vizOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      const src = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.5;
      analyser.minDecibels = -100;
      analyser.maxDecibels = 0;
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (err) {
      console.warn('visualizer unavailable', err);
      audioCtx = null; analyser = null;
    }
  }

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    colors = { c1: css.getPropertyValue('--viz').trim(), c2: css.getPropertyValue('--viz-2').trim() };
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = el.viz.getBoundingClientRect();
    el.viz.width = Math.round(r.width * dpr);
    el.viz.height = Math.round(r.height * dpr);
  }
  window.addEventListener('resize', resizeCanvas);

  function computeBandEdges() {
    const nyquist = audioCtx.sampleRate / 2;
    const bins = analyser.frequencyBinCount;
    const edges = new Array(BANDS + 1);
    for (let i = 0; i <= BANDS; i++) {
      const hz = F_LO * (F_HI / F_LO) ** (i / BANDS);
      edges[i] = Math.min(bins - 1, Math.round((hz / nyquist) * bins));
    }
    return edges;
  }

  function setBass(v) { document.documentElement.style.setProperty('--bass', v.toFixed(3)); }

  // The stage shows the selected episode; the ring runs only while that one plays.
  function stageLive() { return vizOn && !!analyser && !audio.paused && playing === selected; }

  function updateStage() {
    const isPlayingThis = !!playing && !audio.paused && playing === selected;
    el.stage.classList.toggle('playing', isPlayingThis);
    el.bigPlay.setAttribute('aria-label', isPlayingThis ? 'Pause' : 'Play');
    if (stageLive()) drawViz(); else clearViz();
  }

  function drawViz() {
    cancelAnimationFrame(vizFrame);
    if (!stageLive()) { clearViz(); return; }
    if (!bandEdges) bandEdges = computeBandEdges();
    readColors();
    resizeCanvas();
    const data = new Float32Array(analyser.frequencyBinCount);
    const frame = () => {
      if (!stageLive()) { clearViz(); return; }
      vizFrame = requestAnimationFrame(frame);
      analyser.getFloatFrequencyData(data);

      let maxDb = -120;
      const bandDb = new Float32Array(BANDS);
      for (let i = 0; i < BANDS; i++) {
        const from = bandEdges[i];
        const to = Math.max(from + 1, bandEdges[i + 1]);
        let power = 0;
        for (let b = from; b < to; b++) power += 10 ** (data[b] / 10);
        const db = 10 * Math.log10(power + 1e-12) + (i / BANDS) * TILT_DB;
        bandDb[i] = db;
        if (db > maxDb) maxDb = db;
      }
      // Ceiling jumps up to the loudest band and drifts down slowly, so quiet passages still move.
      ceiling = maxDb > ceiling ? maxDb : Math.max(-80, ceiling - CEIL_FALL);
      const lo = ceiling - RANGE_DB;
      for (let i = 0; i < BANDS; i++) {
        const v = Math.min(1, Math.max(0, (bandDb[i] - lo) / RANGE_DB)) ** 1.3;
        levels[i] = v > levels[i] ? v : levels[i] * RELEASE;
        if (levels[i] >= peaks[i]) { peaks[i] = levels[i]; peakHold[i] = PEAK_HOLD; }
        else if (peakHold[i] > 0) peakHold[i] -= 1;
        else peaks[i] = Math.max(levels[i], peaks[i] - PEAK_FALL);
      }

      const W = el.viz.width, H = el.viz.height;
      const dpr = window.devicePixelRatio || 1;
      ctx2d.clearRect(0, 0, W, H);
      const br = el.bigPlay.getBoundingClientRect();
      const vr = el.viz.getBoundingClientRect();
      const cx = (br.left + br.width / 2 - vr.left) * dpr;
      const cy = (br.top + br.height / 2 - vr.top) * dpr;
      const inner = (br.width / 2 + 9) * dpr;
      const maxLen = Math.min(cx, cy, W - cx, H - cy) - inner - 6 * dpr;
      const step = Math.PI / BANDS;
      const bw = Math.max(1.5 * dpr, inner * step * 0.62);

      ctx2d.save();
      ctx2d.translate(cx, cy);
      ctx2d.lineCap = 'round';
      ctx2d.lineWidth = bw;
      for (let i = 0; i < BANDS; i++) {
        const v = levels[i];
        const len = Math.max(2 * dpr, v * maxLen);
        // Bass at the bottom, treble at the top, mirrored on both sides.
        const a = Math.PI / 2 - (i + 0.5) * step;
        const grad = ctx2d.createLinearGradient(0, inner, 0, inner + len);
        grad.addColorStop(0, colors.c1);
        grad.addColorStop(1, colors.c2);
        const cap = inner + Math.max(len, peaks[i] * maxLen) + 4 * dpr;
        for (const side of [1, -1]) {
          ctx2d.save();
          ctx2d.rotate(side * a);
          ctx2d.strokeStyle = grad;
          ctx2d.globalAlpha = 0.4 + v * 0.6;
          ctx2d.beginPath();
          ctx2d.moveTo(0, inner);
          ctx2d.lineTo(0, inner + len);
          ctx2d.stroke();
          ctx2d.strokeStyle = colors.c1;
          ctx2d.globalAlpha = 0.55 + peaks[i] * 0.45;
          ctx2d.beginPath();
          ctx2d.moveTo(0, cap);
          ctx2d.lineTo(0, cap + 2.5 * dpr);
          ctx2d.stroke();
          ctx2d.restore();
        }
      }
      ctx2d.restore();
      ctx2d.globalAlpha = 1;

      let bass = 0;
      for (let i = 0; i < 6; i++) bass += levels[i];
      setBass(bass / 6);
    };
    frame();
  }

  function clearViz() {
    cancelAnimationFrame(vizFrame);
    vizFrame = null;
    ctx2d.clearRect(0, 0, el.viz.width, el.viz.height);
    levels.fill(0);
    peaks.fill(0);
    setBass(0);
  }

  function setVizOn(on) {
    vizOn = on;
    prefs.set('viz', on);
    el.vizToggle.setAttribute('aria-pressed', String(on));
    el.app.classList.toggle('viz-off', !on);
    if (on && playing && !audio.paused) ensureAudioGraph();
    updateStage();
  }
  el.vizToggle.addEventListener('click', () => setVizOn(!vizOn));
  el.bigPlay.addEventListener('click', () => { if (playing === selected) togglePlay(); else play(selected); });

  // ---------- wiring ----------
  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.ep');
    if (!row) return;
    if (e.target.closest('.ep-play')) { select(row.dataset.slug); play(row.dataset.slug); return; }
    select(row.dataset.slug);
  });
  el.list.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.ep');
    if (row) play(row.dataset.slug);
  });
  el.filter.addEventListener('input', () => { filterText = el.filter.value; renderList(); });
  el.filter.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { el.filter.value = ''; filterText = ''; renderList(); el.filter.blur(); }
    if (e.key === 'Enter') { const first = el.list.querySelector('.ep'); if (first) { select(first.dataset.slug); el.filter.blur(); } }
  });

  el.dPlay.addEventListener('click', () => {
    if (playing === selected) togglePlay(); else play(selected);
  });
  el.dRestart.addEventListener('click', () => {
    delete state.positions[selected];
    delete state.finished[selected];
    updateRowProgress(selected);
    play(selected, { startAt: 0 });
  });
  el.dFinished.addEventListener('click', () => {
    if (isFinished(selected)) delete state.finished[selected];
    else { state.finished[selected] = true; delete state.positions[selected]; }
    updateRowProgress(selected);
    updateDetailButtons();
    saveStateSoon(0);
  });
  el.tracks.addEventListener('click', (e) => {
    const row = e.target.closest('.track');
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const times = trackTimes(selected);
    if (times[idx] != null) play(selected, { startAt: times[idx] });
  });

  el.playBtn.addEventListener('click', togglePlay);
  el.prevBtn.addEventListener('click', () => stepTrack(-1));
  el.nextBtn.addEventListener('click', () => stepTrack(1));
  el.back10.addEventListener('click', () => seekBy(-10));
  el.fwd30.addEventListener('click', () => seekBy(30));
  el.tRemaining.addEventListener('click', () => { showTotal = !showTotal; prefs.set('showTotal', showTotal); updateTimes(); });
  el.backBtn.addEventListener('click', () => el.app.classList.remove('show-detail'));
  el.barArt.addEventListener('click', () => { if (playing) select(playing, { scroll: true }); });

  // Seek bar: drag shows the target time, release applies it.
  function seekPct() { return Number(el.seek.value) / 1000; }
  function durationNow() { return audio.duration || bySlug.get(playing)?.duration || 0; }
  el.seek.addEventListener('pointerdown', () => { seekDragging = true; el.seekTrack.classList.add('dragging'); });
  el.seek.addEventListener('input', () => {
    seekDragging = true;
    const p = seekPct();
    el.seekPlayed.style.width = `${p * 100}%`;
    el.seekThumb.style.left = `${p * 100}%`;
    el.tElapsed.textContent = fmtTime(p * durationNow());
    showTip(p);
  });
  el.seek.addEventListener('change', () => {
    seekDragging = false;
    el.seekTrack.classList.remove('dragging');
    const p = seekPct();
    if (playing) seekTo(p * durationNow());
    else {
      const target = selected || state.lastSlug;
      if (target) play(target, { startAt: p * (bySlug.get(target)?.duration || 0) });
    }
  });
  function showTip(p) {
    const d = durationNow();
    if (!d) { el.seekTip.hidden = true; return; }
    const t = p * d;
    const ep = bySlug.get(playing || selected);
    const idx = ep ? trackAt(ep.slug, t) : -1;
    const name = idx >= 0 && ep.tracks[idx] ? ep.tracks[idx].title : '';
    el.seekTip.innerHTML = `${fmtTime(t)}${name ? ` <small>· ${esc(name)}</small>` : ''}`;
    el.seekTip.style.left = `${p * 100}%`;
    el.seekTip.hidden = false;
  }
  el.seekTrack.addEventListener('pointermove', (e) => {
    if (seekDragging) return;
    const r = el.seekTrack.getBoundingClientRect();
    showTip(clamp((e.clientX - r.left) / r.width, 0, 1));
  });
  el.seekTrack.addEventListener('pointerleave', () => { if (!seekDragging) el.seekTip.hidden = true; });

  el.continueMode.addEventListener('change', () => prefs.set('continue', el.continueMode.value));
  el.speed.addEventListener('change', () => { audio.playbackRate = Number(el.speed.value); prefs.set('speed', el.speed.value); });
  el.sleep.addEventListener('change', () => setSleep(Number(el.sleep.value)));
  el.volume.addEventListener('input', () => { if (audio.muted) audio.muted = false; applyVolume(); });
  el.muteBtn.addEventListener('click', () => { audio.muted = !audio.muted; prefs.set('muted', audio.muted); applyVolume(); });
  el.themeToggle.addEventListener('click', cycleTheme);
  el.helpBtn.addEventListener('click', () => el.help.showModal());
  el.refreshBtn.addEventListener('click', (e) => refresh(e.shiftKey));

  // Audio events
  audio.addEventListener('play', updatePlayButton);
  audio.addEventListener('pause', () => { updatePlayButton(); rememberPosition(true); el.playBtn.classList.remove('loading'); });
  audio.addEventListener('playing', () => { el.playBtn.classList.remove('loading'); updatePlayButton(); });
  audio.addEventListener('waiting', () => el.playBtn.classList.add('loading'));
  audio.addEventListener('loadstart', () => { if (!audio.paused) el.playBtn.classList.add('loading'); });
  audio.addEventListener('canplay', () => el.playBtn.classList.remove('loading'));
  audio.addEventListener('timeupdate', () => { updateTimes(); updateNowTrack(); rememberPosition(); updatePositionState(); });
  audio.addEventListener('durationchange', updateTimes);
  audio.addEventListener('progress', updateTimes);
  audio.addEventListener('seeked', () => { updateTimes(); updateNowTrack(true); rememberPosition(true); });
  audio.addEventListener('ratechange', updatePositionState);
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', () => {
    el.playBtn.classList.remove('loading');
    const code = audio.error?.code;
    const msg = { 1: 'aborted', 2: 'network error', 3: 'cannot decode', 4: 'file not supported or not reachable' }[code] || 'unknown error';
    toast(`Playback failed: ${msg}`, true);
    updatePlayButton();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.help.open;
    if (typing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const handled = () => e.preventDefault();
    if (k === ' ' || k === 'k') { handled(); togglePlay(); }
    else if (k === 'ArrowLeft') { handled(); seekBy(e.shiftKey ? -300 : -10); }
    else if (k === 'ArrowRight') { handled(); seekBy(e.shiftKey ? 300 : 30); }
    else if (k === 'j') { handled(); seekBy(-60); }
    else if (k === 'l') { handled(); seekBy(60); }
    else if (k === 'ArrowUp') { handled(); nudgeVolume(5); }
    else if (k === 'ArrowDown') { handled(); nudgeVolume(-5); }
    else if (k === 'm') { handled(); el.muteBtn.click(); }
    else if (k === 'n') { handled(); stepEpisode(1); }
    else if (k === 'p') { handled(); stepEpisode(-1); }
    else if (k === '[') { handled(); stepTrack(-1); }
    else if (k === ']') { handled(); stepTrack(1); }
    else if (k === '/') { handled(); el.filter.focus(); el.filter.select(); }
    else if (k === 't') { handled(); cycleTheme(); }
    else if (k === 'v') { handled(); setVizOn(!vizOn); }
    else if (k === '?') { handled(); el.help.showModal(); }
    else if (/^[0-9]$/.test(k)) { handled(); seekTo(Number(k) / 10 * durationNow()); }
  });

  // Save the position when the tab is hidden or closed.
  document.addEventListener('visibilitychange', () => { if (document.hidden) { rememberPosition(true); saveState(true); } });
  window.addEventListener('pagehide', () => { rememberPosition(true); saveState(true); });

  // ---------- start ----------
  async function init() {
    applyTheme(prefs.get('theme', 'dark'));
    el.volume.value = Math.round(prefs.get('volume', 0.8) * 100);
    audio.muted = prefs.get('muted', false);
    applyVolume();
    el.speed.value = prefs.get('speed', '1');
    audio.playbackRate = Number(el.speed.value);
    el.continueMode.value = prefs.get('continue', 'next');
    showTotal = prefs.get('showTotal', false);
    setVizOn(vizOn);

    try {
      const [data, st] = await Promise.all([loadCatalog(), getJSON('/api/state')]);
      state = { lastSlug: null, positions: {}, finished: {}, ...st };
      renderList();
      const start = (state.lastSlug && bySlug.get(state.lastSlug)) ? state.lastSlug : data.episodes[0]?.slug;
      if (start) {
        select(start, { scroll: true });
        // Show the last episode in the bar so space / play resumes it. No autoplay.
        if (state.lastSlug === start) load(start);
      }
    } catch (err) {
      el.catalogInfo.textContent = `Cannot reach the server: ${err.message}`;
      toast(`Cannot reach the server: ${err.message}`, true);
    }
  }
  init();
})();

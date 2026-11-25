/* EVONG web: assets (packed images, audio), Java-like fonts, animations. */
(function (global) {
  'use strict';
  const E1 = global.E1 || (global.E1 = {});

  // ------------------------------------------------------------------ images
  // JImage: a decoded image with lazy alpha access (BufferedImage.getRGB(x,y) >>> 24)
  class JImage {
    constructor(src, w, h) { this.src = src; this.width = w; this.height = h; this._alpha = null; }
    alphaData() {
      if (!this._alpha) {
        const c = document.createElement('canvas');
        c.width = this.width; c.height = this.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(this.src, 0, 0);
        const d = g.getImageData(0, 0, this.width, this.height).data;
        const a = new Uint8Array(this.width * this.height);
        for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
        this._alpha = a;
      }
      return this._alpha;
    }
    alpha(x, y) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) throw new RangeError('out of bounds');
      return this.alphaData()[y * this.width + x];
    }
  }
  E1.JImage = JImage;

  function canvasImage(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    const g = c.getContext('2d');
    if (draw) draw(g);
    return new JImage(c, w, h);
  }
  E1.canvasImage = canvasImage;

  class Assets {
    constructor(base, lang) {
      this.base = base; this.lang = lang;
      this.manifest = null; this.images = new Map(); this.urls = new Map();
      this.mirrored = new Map(); this.scaled = new Map();
    }
    has(path) { return !!(this.manifest.images[path]); }
    async loadPacks(onProgress) {
      const packs = this.manifest.packs;
      const total = packs.reduce((a, p) => a + (p.b64 || p.n), 0) || 1;
      let loaded = 0;
      const bufs = await Promise.all(packs.map(async (p) => {
        const size = p.b64 || p.n;
        const r = await fetch(this.base + p.p);
        if (!r.ok) throw new Error('pack ' + p.p + ' ' + r.status);
        let out;
        if (!r.body || !r.body.getReader) {
          out = new Uint8Array(await r.arrayBuffer()); loaded += size; if (onProgress) onProgress(Math.min(1, loaded / total));
        } else {
          const reader = r.body.getReader();
          out = new Uint8Array(size);
          let off = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (off + value.length > out.length) { const o2 = new Uint8Array(Math.max(out.length * 2, off + value.length)); o2.set(out); out = o2; }
            out.set(value, off); off += value.length; loaded += value.length;
            if (onProgress) onProgress(Math.min(1, loaded / total));
          }
          out = out.subarray(0, off);
        }
        if (p.b64) {
          const bin = atob(new TextDecoder().decode(out));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes.buffer;
        }
        return out.buffer.byteLength === out.length ? out.buffer : out.slice().buffer;
      }));
      for (const [path, e] of Object.entries(this.manifest.images)) {
        this.urls.set(path, URL.createObjectURL(new Blob([new Uint8Array(bufs[e.k], e.o, e.n)], { type: e.t })));
      }
    }
    async decodeAll(onProgress) {
      const paths = Object.keys(this.manifest.images);
      let done = 0;
      const queue = paths.slice();
      const worker = async () => {
        while (queue.length) {
          const p = queue.shift();
          await this.decode(p);
          done++;
          if (onProgress) onProgress(done / paths.length);
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
    }
    async decode(path) {
      if (this.images.has(path)) return this.images.get(path);
      const e = this.manifest.images[path];
      const img = new Image();
      img.src = this.urls.get(path);
      try { await img.decode(); } catch (err) { await new Promise((res) => { img.onload = res; img.onerror = res; }); }
      const ji = new JImage(img, e.w, e.h);
      this.images.set(path, ji);
      return ji;
    }
    // MultimediaManager.loadImageFromZip
    image(path) { return (path && this.images.get(path)) || null; }
    mirroredImage(path) {
      let m = this.mirrored.get(path);
      if (m === undefined) {
        const src = this.image(path);
        m = src ? canvasImage(src.width, src.height, (g) => { g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src.src, 0, 0); }) : null;
        this.mirrored.set(path, m);
      }
      return m;
    }
    text(path) { return this.manifest.texts[path] || null; }
    audioUrl(path) { const p = this.manifest.audio[path]; return p ? this.base + p : null; }
  }
  E1.Assets = Assets;

  // nearest-neighbour scaled copy (Graphics2D.drawImage(img, AffineTransform.getScaleInstance(s,s), null))
  const scaledCache = new WeakMap();
  E1.scaledImage = function (img, s) {
    if (s === 1) return img;
    let m = scaledCache.get(img);
    if (!m) { m = new Map(); scaledCache.set(img, m); }
    let r = m.get(s);
    if (!r) {
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      r = canvasImage(w, h, (g) => { g.imageSmoothingEnabled = false; g.scale(s, s); g.drawImage(img.src, 0, 0); });
      m.set(s, r);
    }
    return r;
  };

  // ------------------------------------------------------------------ fonts
  // Java-like font: logical size + horizontal width factor (TextAttribute.WIDTH)
  const FONT_FAMILY = '"EvongSans", "Liberation Sans", Arimo, Arial, Helvetica, sans-serif';
  const LS = { ascent: 1854 / 2048, descent: 434 / 2048, lineGap: 67 / 2048 };
  let measureCtx = null;
  class JFont {
    constructor(size, bold, width, family, metrics) {
      this.size = size; this.bold = !!bold; this.wscale = width || 1;
      this.family = family || FONT_FAMILY;
      this.css = (this.bold ? 'bold ' : '') + size + 'px ' + this.family;
      const m = metrics || LS;
      const asc = m.ascent * size, desc = m.descent * size, lead = m.lineGap * size;
      // sun.font.FontDesignMetrics rounding
      this.ascent = Math.floor(0.95 + asc);
      this.descent = Math.floor(0.95 + desc);
      this.leading = Math.floor(0.95 + desc + lead) - this.descent;
      this.height = this.ascent + this.descent + this.leading;
      this.adv = new Map();
    }
    advance(ch) {
      let a = this.adv.get(ch);
      if (a === undefined) {
        if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = this.css;
        try { measureCtx.fontKerning = 'none'; } catch (e) { /* old browsers */ }
        a = measureCtx.measureText(ch).width * this.wscale;
        this.adv.set(ch, a);
      }
      return a;
    }
    // FontMetrics.stringWidth without fractional metrics: hinted integer advances of the untransformed
    // font, summed, then scaled by the WIDTH factor and rounded (as Java does for transformed fonts)
    widthInt(s) {
      let w = 0;
      if (this.hinted) {
        for (const ch of s) { const h = this.hinted[ch.codePointAt(0)]; w += h !== undefined ? h : Math.round(this.advance(ch) / this.wscale); }
        return Math.floor(0.5 + w * this.wscale);
      }
      for (const ch of s) w += Math.round(this.advance(ch));
      return w;
    }
    // with fractional metrics on
    widthFrac(s) { let w = 0; for (const ch of s) w += this.advance(ch); return w; }
    stringWidth(s, frac) { return frac ? Math.floor(0.5 + this.widthFrac(s)) : this.widthInt(s); }
    draw(g, s, x, y, color) {
      g.save();
      g.font = this.css;
      try { g.fontKerning = 'none'; } catch (e) { /* ignore */ }
      g.fillStyle = color;
      g.textBaseline = 'alphabetic';
      g.translate(x, y);
      if (this.wscale !== 1) g.scale(this.wscale, 1);
      g.fillText(s, 0, 0);
      g.restore();
    }
  }
  E1.JFont = JFont;
  // java FontMetrics.charWidth of Dialog 18 (Liberation Sans/Arial metrics) with hinting, no fractional metrics
  E1.HINTED_18 = {"32":5,"33":6,"34":6,"35":10,"36":10,"37":16,"38":12,"39":3,"40":6,"41":6,"42":7,"43":11,"44":5,"45":6,"46":5,"47":5,"48":10,"49":10,"50":10,"51":10,"52":10,"53":10,"54":10,"55":10,"56":10,"57":10,"58":5,"59":5,"60":11,"61":11,"62":11,"63":10,"64":18,"65":11,"66":12,"67":13,"68":13,"69":12,"70":11,"71":14,"72":13,"73":4,"74":9,"75":12,"76":10,"77":15,"78":13,"79":14,"80":12,"81":14,"82":13,"83":12,"84":12,"85":13,"86":11,"87":17,"88":11,"89":12,"90":11,"91":5,"92":5,"93":5,"94":7,"95":10,"96":6,"97":10,"98":10,"99":9,"100":10,"101":10,"102":5,"103":10,"104":10,"105":4,"106":4,"107":9,"108":4,"109":14,"110":10,"111":10,"112":10,"113":10,"114":6,"115":9,"116":5,"117":10,"118":9,"119":13,"120":8,"121":9,"122":8,"123":6,"124":6,"125":6,"126":11,"160":5,"161":6,"162":10,"163":10,"164":10,"165":10,"166":6,"167":10,"168":6,"169":13,"170":6,"171":10,"172":11,"173":6,"174":13,"175":10,"176":7,"177":10,"178":6,"179":6,"180":6,"181":10,"182":10,"183":6,"184":6,"185":6,"186":7,"187":10,"188":15,"189":15,"190":15,"191":11,"192":11,"193":11,"194":11,"195":11,"196":11,"197":11,"198":18,"199":13,"200":12,"201":12,"202":12,"203":12,"204":4,"205":4,"206":4,"207":4,"208":13,"209":13,"210":14,"211":14,"212":14,"213":14,"214":14,"215":11,"216":14,"217":13,"218":13,"219":13,"220":13,"221":12,"222":12,"223":11,"224":10,"225":10,"226":10,"227":10,"228":10,"229":10,"230":16,"231":9,"232":10,"233":10,"234":10,"235":10,"236":6,"237":6,"238":6,"239":6,"240":10,"241":10,"242":10,"243":10,"244":10,"245":10,"246":10,"247":10,"248":10,"249":10,"250":10,"251":10,"252":10,"253":9,"254":10,"255":9,"8211":10,"8212":18,"8216":4,"8217":4,"8220":7,"8221":7,"8226":6,"8230":18,"8364":10};
  E1.FONT_FAMILY = FONT_FAMILY;

  // ------------------------------------------------------------------ animations
  // ImageSet / ImageAnimation (frames path_NN.png at 100 ms) and FrameAnimation (.eaa)
  class ImageSet {
    constructor(images) { this.imageSet = images.length ? images : [null]; this.currentFrameIndex = 0; }
    start() { this.currentFrameIndex = 0; }
    nextImage() {
      let bl = false;
      ++this.currentFrameIndex;
      if (this.currentFrameIndex >= this.imageSet.length) { this.currentFrameIndex %= this.imageSet.length; bl = true; }
      return bl;
    }
    getImage() { return this.imageSet[this.currentFrameIndex]; }
    isPlayingForFirstTime() { return true; }
    update() {}
    stopMusic() {}
  }
  class ImageAnimation extends ImageSet {
    constructor(images) { super(images); this.acc = 0; this.first = true; }
    start() { super.start(); this.acc = 0; this.first = true; }
    isPlayingForFirstTime() { return this.first; }
    update(l) {
      this.acc += l;
      if (this.imageSet.length > 1) {
        while (this.acc > 100) { this.acc -= 100; ++this.currentFrameIndex; }
        if (this.currentFrameIndex >= this.imageSet.length) { this.currentFrameIndex %= this.imageSet.length; this.first = false; }
      } else if (this.acc > 100) this.first = false;
    }
  }
  // common/data/animation/Animation + engine FrameAnimation
  class FrameAnimation {
    constructor(game, data, mirror, fullscreen) {
      this.game = game; this.a = data; this.mirror = mirror; this.fullscreen = fullscreen;
      this.acc = 0; this.prevSound = null; this.skipped = 0; this.lastSoundFrame = -1; this.newSound = null;
      this.temp = null;
    }
    frameImage(i) {
      const f = this.a.frames[i];
      return this.mirror ? this.game.assets.mirroredImage(f.uri) : this.game.assets.image(f.uri);
    }
    totalTime() {
      let l = 0;
      const fr = this.a.frames;
      for (let i = 0; i < fr.length; i++) {
        l += fr[i].time;
        if (i < fr.length - 1 && this.a.useTransitions) l += this.a.transitions[i + 1].time;
      }
      return l;
    }
    imageAt(l) {
      const fr = this.a.frames, tr = this.a.transitions;
      let n3 = this.skipped, n4 = 0;
      for (const f of fr) if (f.waitforclick) n4++;
      if (!this.a.slides || n4 <= this.skipped) l %= this.totalTime();
      for (let i = 0; i < fr.length; i++) {
        if (fr[i].waitforclick) --n3;
        if (fr[i].time > l || (fr[i].waitforclick && n3 < 0 && this.a.slides)) {
          if (this.lastSoundFrame !== i) { this.newSound = fr[i].soundUri; this.lastSoundFrame = i; }
          return this.frameImage(i);
        }
        if (i === fr.length - 1) return null;
        l -= fr[i].time;
        if (tr[i + 1].time > l && this.a.useTransitions) return this.combined(i, l);
        if (this.a.useTransitions) l -= tr[i + 1].time;
      }
      return null;
    }
    combined(i, l) {
      const im1 = this.frameImage(i), im2 = this.frameImage(i + 1);
      const t = this.a.transitions[i + 1];
      if (!im1 || !im2 || t.type === 0) return im1;
      const w = im2.width, h = im2.height, f = l / t.time;
      if (!this.temp || this.temp.width !== w || this.temp.height !== h) this.temp = canvasImage(w, h);
      const g = this.temp.src.getContext('2d');
      g.clearRect(0, 0, w, h);
      if (t.type === 1) {
        g.globalAlpha = 1 - f; g.drawImage(im1.src, 0, 0);
        g.globalAlpha = f; g.drawImage(im2.src, 0, 0); g.globalAlpha = 1;
      } else if (t.type === 2) {
        const dx = Math.trunc(w * f);
        g.drawImage(im1.src, dx, 0); g.drawImage(im2.src, dx - w, 0);
      } else if (t.type === 3) {
        const dy = Math.trunc(h * f);
        g.drawImage(im1.src, 0, dy); g.drawImage(im2.src, 0, dy - h);
      }
      return this.temp;
    }
    getImage() {
      const img = this.imageAt(this.acc);
      const s = this.newSound; this.newSound = null;
      const mm = this.game.mm;
      if (s !== null && s !== undefined && s !== '') {
        if (this.prevSound !== null) mm.stopPlaying(this.prevSound);
        this.prevSound = mm.loadSound(s, false, true);
        mm.startPlaying(this.prevSound);
      } else if (!mm.isPlaying(this.prevSound)) this.prevSound = null;
      return img;
    }
    stopMusic() { if (this.prevSound !== null) { this.game.mm.stopPlaying(this.prevSound); this.prevSound = null; } }
    isPlayingForFirstTime() {
      const fr = this.a.frames, tr = this.a.transitions;
      let l = this.acc, n = this.skipped;
      for (let i = 0; i < fr.length; i++) {
        if (fr[i].waitforclick) --n;
        if (fr[i].time > l || (fr[i].waitforclick && n < 0 && this.a.slides)) return true;
        if (i === fr.length - 1) return false;
        l -= fr[i].time;
        if (tr[i + 1].time > l && this.a.useTransitions) return true;
        if (this.a.useTransitions) l -= tr[i + 1].time;
      }
      return false;
    }
    start() { this.acc = 0; }
    update(l) { this.acc += l; }
    skipFrame(l) {
      if (!this.a.slides) return l;
      const fr = this.a.frames, tr = this.a.transitions;
      let l2 = 0;
      let n = ++this.skipped;
      for (let i = 0; i < fr.length; i++) {
        if (fr[i].waitforclick) --n;
        if (fr[i].time > l || (fr[i].waitforclick && n < 1)) return l2 + fr[i].time;
        l2 += fr[i].time;
        if (i === fr.length - 1) return 0;
        l -= fr[i].time;
        if (tr[i + 1].time > l) { --this.skipped; return l2 + tr[i + 1].time; }
        l2 += tr[i + 1].time;
        l -= tr[i + 1].time;
      }
      this.skipped = 0;
      return 0;
    }
    nextImage() {
      let bl = false;
      this.acc = this.skipFrame(this.acc);
      const tt = this.totalTime();
      if (this.acc >= tt) { this.acc %= tt; bl = true; }
      return bl;
    }
  }
  E1.ImageSet = ImageSet; E1.ImageAnimation = ImageAnimation; E1.FrameAnimation = FrameAnimation;

  function lead2(n) { return n < 10 ? '0' + n : '' + n; }
  // MultimediaManager.loadAnimation / loadSlides
  E1.AnimationCache = class {
    constructor(game) { this.game = game; this.cache = new Map(); }
    load(path, mirror) {
      const key = path + (mirror ? 't' : 'f');
      let a = this.cache.get(key);
      if (a) return a;
      const assets = this.game.assets;
      if (path && path.endsWith('.eaa')) {
        a = new FrameAnimation(this.game, E1.parseAnimation(assets.text(path)), mirror, false);
      } else {
        const imgs = [];
        for (let i = 1; ; i++) {
          const p = path + '_' + lead2(i) + '.png';
          if (!assets.has(p)) break;
          imgs.push(mirror ? assets.mirroredImage(p) : assets.image(p));
        }
        a = new ImageAnimation(imgs);
      }
      this.cache.set(key, a);
      return a;
    }
    slides(path) {
      const assets = this.game.assets;
      if (path.endsWith('.eaa')) return new FrameAnimation(this.game, E1.parseAnimation(assets.text(path)), false, true);
      const imgs = [];
      for (let i = 1; ; i++) {
        const p = path + '_' + lead2(i) + '.jpg';
        if (!assets.has(p)) break;
        imgs.push(assets.image(p));
      }
      return new ImageSet(imgs);
    }
  };

  // ------------------------------------------------------------------ audio
  function silentWavUrl() {
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  // Short sounds are mixed with the Web Audio API. On Android, starting a second
  // <audio> element can pause the first one for good ; one AudioContext mixes any number of sounds instead.
  class FxPlayer {
    constructor() { this.ctx = null; this.cache = new Map(); this.live = new Set(); this.limit = 1500000; this.hidden = false; }
    unlock() {
      if (this.ctx) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        const s = this.ctx.createBufferSource();
        s.buffer = this.ctx.createBuffer(1, 1, 22050);
        s.connect(this.ctx.destination);
        s.start(0);
        this.resume();
      } catch (e) { this.ctx = null; }
    }
    resume() { const c = this.ctx; if (c && !this.hidden && c.state !== 'running' && c.resume) c.resume().catch(() => {}); }
    // an AudioBuffer, or null when the file is better streamed by a media element
    buffer(url) {
      let p = this.cache.get(url);
      if (!p) {
        p = fetch(url).then((r) => r.arrayBuffer())
          .then((ab) => (ab.byteLength > this.limit ? null : new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej))))
          .catch(() => null);
        this.cache.set(url, p);
      }
      return p;
    }
    // onEnd: the sound finished by itself; onFallback: it has to be played some other way
    play(url, volume, onEnd, onFallback) {
      const h = { gain: this.ctx.createGain(), node: null, stopped: false, done: false };
      h.gain.gain.value = volume;
      h.gain.connect(this.ctx.destination);
      this.live.add(h);
      this.resume();
      this.buffer(url).then((buf) => {
        if (h.stopped) return;
        if (!buf) { this.stop(h); if (onFallback) onFallback(); return; }
        const n = this.ctx.createBufferSource();
        n.buffer = buf;
        n.connect(h.gain);
        n.onended = () => {
          if (h.stopped || h.done) return;
          h.done = true; this.live.delete(h);
          try { h.gain.disconnect(); } catch (e) { /* ignore */ }
          if (onEnd) onEnd();
        };
        h.node = n;
        n.start(0);
      });
      return h;
    }
    setVolume(h, v) { h.gain.gain.value = v; }
    stop(h) {
      if (h.stopped) return;
      h.stopped = true; this.live.delete(h);
      if (h.node) { try { h.node.stop(); } catch (e) { /* not started */ } }
      try { h.gain.disconnect(); } catch (e) { /* ignore */ }
    }
    setHidden(hidden) {
      this.hidden = hidden;
      if (!this.ctx) return;
      if (hidden) { if (this.ctx.suspend) this.ctx.suspend().catch(() => {}); } else this.resume();
    }
  }

  // MultimediaManager sound part: ids, music id, isPlaying
  class Sounds {
    constructor(game) {
      this.game = game; this.next = 1; this.sounds = new Map(); this.musicId = -1;
      this.pool = []; this.unlocked = false; this.hidden = false; this.muted = false;
      this.fx = new FxPlayer();
    }
    unlock() {
      this.fx.unlock();
      if (this.unlocked) return;
      this.unlocked = true;
      const silent = silentWavUrl();
      for (let i = 0; i < 4; i++) {
        const a = new Audio();
        a.preload = 'auto'; a.src = silent;
        const p = a.play();
        if (p && p.then) p.then(() => a.pause()).catch(() => {});
        this.pool.push(a);
      }
      // Android may pause the music on its own: start it again (the game never pauses it)
      setInterval(() => {
        if (this.hidden) return;
        for (const x of this.sounds.values()) if (x.loop && x.playing && x.el && x.el.paused) { const p = x.el.play(); if (p && p.catch) p.catch(() => {}); }
      }, 1000);
    }
    // decode the short sounds ahead of time
    preload(urls) { if (this.fx.ctx) for (const u of urls) if (u) this.fx.buffer(u); }
    element() {
      const free = this.pool.find((a) => !a._busy);
      if (free) return free;
      const a = new Audio(); a.preload = 'auto'; this.pool.push(a); return a;
    }
    // stream: a long piece (an animation's soundtrack) that a media element plays as it downloads
    loadSound(path, loop, stream) {
      const url = path && this.game.assets.audioUrl(path);
      if (!url) return -1;
      const id = this.next++;
      this.sounds.set(id, { id, url, loop: !!loop, stream: !!stream, el: null, h: null, playing: false, started: false });
      return id;
    }
    loadMusic(path, loop) { this.musicId = this.loadSound(path, loop); return this.musicId; }
    startPlaying(id) {
      const s = this.sounds.get(id);
      if (!s || s.started) return;
      s.started = true; s.playing = true;
      // short sounds go through Web Audio, so they never stop the music (Android)
      if (!s.loop && !s.stream && this.fx.ctx) {
        s.h = this.fx.play(s.url, this.muted ? 0 : 1, () => this.finish(s), () => { s.h = null; if (s.playing) this.startElement(s); });
        return;
      }
      this.startElement(s);
    }
    startElement(s) {
      const a = this.element();
      a._busy = true; s.el = a;
      if (a.src !== s.url) a.src = s.url;
      a.loop = s.loop;
      a.muted = this.muted;
      try { a.currentTime = 0; } catch (e) { /* not ready */ }
      a.onended = () => { if (!s.loop) this.finish(s); };
      a.onerror = () => this.finish(s);
      if (!this.hidden) this.play(s);
    }
    play(s) {
      // a refused play() must not leave a blocking sound effect "playing" forever
      const p = s.el.play();
      if (p && p.catch) p.catch(() => { if (!s.loop) this.finish(s); });
    }
    finish(s) {
      s.started = true; s.playing = false;
      if (s.h) { this.fx.stop(s.h); s.h = null; }
      if (s.el) { s.el.onended = null; s.el.onerror = null; s.el.pause(); s.el._busy = false; s.el = null; }
    }
    stopPlaying(id) { const s = this.sounds.get(id); if (s) this.finish(s); }
    isPlaying(id) { const s = (id !== null && id !== -1) ? this.sounds.get(id) : null; return !!(s && s.playing); }
    stopPlayingMusic() { this.stopPlaying(this.musicId); }
    stopAllSounds() { for (const s of this.sounds.values()) if (s.id !== this.musicId) this.finish(s); }
    stopAll() { for (const s of this.sounds.values()) this.finish(s); }
    // forget finished sounds (not the ones loaded and still waiting to start: a speech
    // starts its audio 500 ms after loading it, and update() used to drop it meanwhile)
    update() { for (const [id, s] of this.sounds) if (s.started && !s.playing && id !== this.musicId) this.sounds.delete(id); }
    setHidden(h) {
      this.hidden = h;
      this.fx.setHidden(h);
      for (const s of this.sounds.values()) {
        if (!s.el || !s.playing) continue;
        if (h) s.el.pause(); else this.play(s);
      }
    }
  }
  E1.Sounds = Sounds;
})(typeof window !== 'undefined' ? window : globalThis);

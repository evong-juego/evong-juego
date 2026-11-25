/* EVONG web: eAdventure 1.x engine core (port of es.eucm.eadventure.engine.core.control.*). */
(function (global) {
  'use strict';
  const E1 = global.E1;
  const MIN_INT = E1.MIN_INT;
  const trunc = Math.trunc;
  const jround = (f) => Math.floor(f + 0.5);
  const idiv = (a, b) => trunc(a / b);

  // ===================================================================== conditions / summaries
  class FlagSummary {
    constructor(names) { this.flags = new Map(); for (const n of names) this.flags.set(n, false); }
    activateFlag(n) { if (this.flags.has(n)) this.flags.set(n, true); }
    deactivateFlag(n) { if (this.flags.has(n)) this.flags.set(n, false); }
    isActiveFlag(n) { return this.flags.get(n) === true; }
    existFlag(n) { return this.flags.has(n); }
  }
  class VarSummary {
    constructor(names) { this.vars = new Map(); for (const n of names) this.vars.set(n, 0); }
    setVarValue(n, v) { if (this.vars.has(n)) this.vars.set(n, v | 0); }
    incrementVar(n, v) { if (this.vars.has(n)) this.vars.set(n, (this.vars.get(n) + v) | 0); }
    decrementVar(n, v) { if (this.vars.has(n)) this.vars.set(n, (this.vars.get(n) - v) | 0); }
    getValue(n) { return this.vars.has(n) ? this.vars.get(n) : 0; }
    existVar(n) { return this.vars.has(n); }
  }
  function evalVar(op, value, cur) {
    switch (op) {
      case 4: return cur === value;
      case 7: return cur !== value;
      case 3: return cur >= value;
      case 2: return cur > value;
      case 5: return cur <= value;
      case 6: return cur < value;
      default: return false;
    }
  }
  function evalSimple(game, c) {
    if (c.t === 'flag') return c.active === game.flags.isActiveFlag(c.id);
    return evalVar(c.op, c.value, game.vars.getValue(c.id));
  }
  // FunctionalConditions.allConditionsOk
  function condOk(game, conds) {
    if (!conds) return true;
    let bl = true;
    for (const c of conds.simple) { if (!bl) break; bl = evalSimple(game, c); }
    for (const block of conds.either) {
      if (!bl) continue;
      let o = false;
      for (const c of block) { if (o) break; o = evalSimple(game, c); }
      bl = o;
    }
    return bl;
  }
  E1.condOk = condOk;

  class ItemSummary {
    constructor(items) { this.st = new Map(); for (const id of items.keys()) this.st.set(id, 0); }
    isItemNormal(id) { return this.st.get(id) === 0; }
    isItemGrabbed(id) { return this.st.get(id) === 1; }
    isItemConsumed(id) { return this.st.get(id) === 2; }
    grabItem(id) { if (this.st.has(id)) this.st.set(id, 1); }
    consumeItem(id) { if (this.st.has(id)) this.st.set(id, 2); }
    regenerateItem(id) { if (this.st.has(id)) this.st.set(id, 0); }
  }
  class Inventory {
    constructor() { this.items = []; }
    getItemCount() { return this.items.length; }
    getItem(i) { return this.items[i]; }
    storeItem(fi) { this.items.push(fi); }
    consumeItem(id) {
      let f = null;
      for (const it of this.items) if (it.item.id === id) f = it;
      const i = this.items.indexOf(f);
      if (i >= 0) this.items.splice(i, 1);
    }
  }

  function processText(game, s) { return game.flags && s != null ? flagText(game, varText(game, s)) : s; }
  function exprText(s, evalExpr) {
    if (s == null) return '';
    const parts = E1.jsplit(s, /\(/);
    if (parts.length === 1) return s;
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.length > 0 && p.charAt(0) === '#') {
        const sub = E1.jsplit(p, /\)/);
        parts[i] = evalExpr(sub[0]);
        for (let j = 1; j < sub.length; j++) parts[i] += sub[j];
      } else if (i > 0) parts[i] = '(' + p;
      out += parts[i];
    }
    return out;
  }
  function flagText(game, s) {
    return exprText(s, (e) => {
      if (e.includes('?') && e.includes(':')) {
        const a = E1.jsplit(e.substring(1), /\?|:/);
        if (a.length !== 3 || !game.flags.existFlag(a[0])) return '(' + e + ')';
        return game.flags.isActiveFlag(a[0]) ? a[1] : a[2];
      }
      return '(' + e + ')';
    });
  }
  function varText(game, s) {
    return exprText(s, (e) => {
      if (e.includes('?') && e.includes(':')) {
        const a = E1.jsplit(e.substring(1), /\?|:/);
        if (a.length !== 3) return '(' + e + ')';
        let op = 0, ops = [a[0]];
        if (a[0].includes('>=')) { op = 1; ops = a[0].split('>='); } else if (a[0].includes('>')) { op = 2; ops = a[0].split('>'); }
        else if (a[0].includes('<=')) { op = 3; ops = a[0].split('<='); } else if (a[0].includes('<')) { op = 4; ops = a[0].split('<'); }
        else if (a[0].includes('==')) { op = 5; ops = a[0].split('=='); }
        if (op === 0) return '(' + e + ')';
        const v = parseInt(ops[1], 10);
        if (!/^[+-]?\d+$/.test(ops[1] || '') || !game.vars.existVar(ops[0])) return '(' + e + ')';
        const c = game.vars.getValue(ops[0]);
        const r = op === 1 ? c >= v : op === 2 ? c > v : op === 3 ? c <= v : op === 4 ? c < v : c === v;
        return r ? a[1] : a[2];
      }
      const name = e.substring(1);
      return game.vars.existVar(name) ? '' + game.vars.getValue(name) : '(' + e + ')';
    });
  }

  // first resources block whose conditions hold (createResourcesBlock)
  function resourcesBlock(game, list, fallback) {
    for (const r of list) if (condOk(game, r.conditions)) return r;
    return fallback || { name: '', assets: new Map(), conditions: null, fallback: true };
  }
  const EMPTY = (p) => !p || p === 'assets/special/EmptyAnimation' || p === 'assets/special/EmptyAnimation.eaa';
  function description(game, list) {
    for (const d of list) { if (d.conditions && !condOk(game, d.conditions)) continue; return d; }
    return { name: '', brief: '', detailed: '', nameSound: '', briefSound: '', detailedSound: '' };
  }
  E1.description = description;

  // java.awt.Polygon.contains(double, double)
  function polygonContains(pts, x, y) {
    const n = pts.length;
    if (n <= 2) return false;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of pts) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    if (!(x >= minx && y >= miny && x < maxx && y < maxy)) return false;
    let hits = 0, lastx = pts[n - 1].x, lasty = pts[n - 1].y;
    for (let i = 0; i < n; i++) {
      const curx = pts[i].x, cury = pts[i].y;
      const lx = lastx, ly = lasty;
      lastx = curx; lasty = cury;
      if (cury === ly) continue;
      let leftx;
      if (curx < lx) { if (x >= lx) continue; leftx = curx; } else { if (x >= curx) continue; leftx = lx; }
      let t1, t2;
      if (cury < ly) {
        if (y < cury || y >= ly) continue;
        if (x < leftx) { hits++; continue; }
        t1 = x - curx; t2 = y - cury;
      } else {
        if (y < ly || y >= cury) continue;
        if (x < leftx) { hits++; continue; }
        t1 = x - lx; t2 = y - ly;
      }
      if (t1 < (t2 / (ly - cury) * (lx - curx))) hits++;
    }
    return (hits & 1) !== 0;
  }
  E1.polygonContains = polygonContains;
  function exitInside(exit, n, n2) {
    if (exit.rectangular) return n > exit.x && n < exit.x + exit.width && n2 > exit.y && n2 < exit.y + exit.height;
    return polygonContains(exit.points, n, n2);
  }

  // removeTransparentParts (FunctionalItem variant, cached per source image)
  const cropCache = new WeakMap();
  function cropItem(img) {
    let r = cropCache.get(img);
    if (r) return r;
    const W = img.width, H = img.height, a = img.alphaData();
    let n = W - 1, n2 = H - 1, n3 = 0, n4 = 0;
    for (let i = 0; i < W; i++) {
      let first = true;
      for (let j = 0; j < H; j++) {
        if (a[j * W + i] <= 0) continue;
        if (first) n = Math.min(n, i);
        n2 = Math.min(n2, j);
        first = false;
        n3 = Math.max(n3, i); n4 = Math.max(n4, j);
      }
    }
    if (n3 <= n || n4 <= n2) { n3 = W - 1; n4 = H - 1; n = 0; n2 = 0; }
    const w = n3 - n, h = n4 - n2;
    const crop = E1.canvasImage(w, h, (g) => g.drawImage(img.src, n, n2, w, h, 0, 0, w, h));
    r = { crop, x1: n, y1: n2, x2: n3, y2: n4, W: W - 1, H: H - 1 };
    cropCache.set(img, r);
    return r;
  }
  const atrezzoCache = new WeakMap();
  function cropAtrezzo(img) {
    let r = atrezzoCache.get(img);
    if (r) return r;
    const W = img.width, H = img.height, a = img.alphaData();
    let x1 = W, y1 = H, x2 = 0, y2 = 0;
    for (let i = 0; i < W; i++) {
      let first = true;
      for (let j = 0; j < H; j++) {
        if (a[j * W + i] <= 0) continue;
        if (first) x1 = Math.min(x1, i);
        y1 = Math.min(y1, j);
        first = false;
        x2 = Math.max(x2, i); y2 = Math.max(y2, j);
      }
    }
    if (x2 <= x1 || y2 <= y1) { x2 = W - 1; y2 = H - 1; x1 = 0; y1 = 0; }
    const w = x2 - x1, h = y2 - y1;
    const crop = E1.canvasImage(w, h, (g) => g.drawImage(img.src, x1, y1, w, h, 0, 0, w, h));
    r = { crop, x1, y1, x2, y2, W, H };
    atrezzoCache.set(img, r);
    return r;
  }

  // ===================================================================== functional elements
  class FunctionalElement {
    constructor(game, x, y) { this.game = game; this.x = x; this.y = y; this.scale = 1; this.layer = -1; this.highlight = null; }
    getX() { return this.x; } getY() { return this.y; } getScale() { return this.scale; }
    setX(v) { this.x = v; } setY(v) { this.y = v; }
    canBeUsedAlone() { return false; }
    examine() { return false; }
    isInInventory() { return false; }
    use() { return false; }
    canBeDragged() { return false; }
    firstValidAction(actions, type) {
      for (const a of actions) if (a.type === type && condOk(this.game, a.conditions)) { a.conditionsAreMeet = true; return a; }
      for (const a of actions) if (a.type === type && a.activatedNotEffects) { a.conditionsAreMeet = false; return a; }
      return null;
    }
    firstValidCustom(actions, type, name, endsWith) {
      const m = (a) => a.type === type && (endsWith ? a.name.endsWith(name) : a.name === name);
      for (const a of actions) if (m(a) && condOk(this.game, a.conditions)) return a;
      for (const a of actions) if (m(a) && a.activatedNotEffects) return a;
      return null;
    }
    // shared "run first valid action of type else its not-effects" pattern
    runAction(actions, pred) {
      for (const a of actions) if (pred(a) && condOk(this.game, a.conditions)) { this.game.storeAllEffects(a.effects); return true; }
      for (const a of actions) if (pred(a) && a.activatedNotEffects) { this.game.storeAllEffects(a.notEffects); return true; }
      return false;
    }
  }

  class FunctionalItem extends FunctionalElement {
    constructor(game, item, ref, x, y) {
      super(game, ref ? ref.x : (x || 0), ref ? ref.y : (y || 0));
      this.item = item;
      this.reference = ref || null;
      if (ref) { this.scale = ref.scale; this.layer = ref.layer; }
      this.isMouseOver = false; this.timeElapsed = 0; this.startCounting = false;
      this.image = null; this.imageOver = null; this.icon = null;
      this.nrm = null; this.ovr = null;
      this.x1 = this.y1 = this.x2 = this.y2 = 2147483647; this.width = 0; this.height = 0;
      this.transitionNormal = null; this.transitionOver = null;
      if (!item.isArea) this.loadImages(true);
    }
    createResourcesBlock() {
      return resourcesBlock(this.game, this.item.resources, {
        name: '', conditions: null, fallback: true,
        assets: new Map([['icon', 'gui/defaultassets/NRB_icon.png'], ['image', 'gui/defaultassets/NRB_image.png']]),
      });
    }
    loadImages(first) {
      const a = this.game.assets;
      this.resources = this.createResourcesBlock();
      let img = this.resources.assets.has('image') ? a.image(this.resources.assets.get('image')) : null;
      const over = this.resources.assets.has('imageover') ? a.image(this.resources.assets.get('imageover')) : null;
      if (over && img && (over.width > img.width || over.height > img.height)) {
        const src = img;
        img = E1.canvasImage(over.width, over.height, (g) => g.drawImage(src.src, jround((over.width - src.width) / 2), jround((over.height - src.height) / 2)));
      }
      const prevN = this.image, prevO = this.imageOver;
      if (img) { this.nrm = cropItem(img); this.image = this.nrm.crop; }
      if (over) { this.ovr = cropItem(over); this.imageOver = this.ovr.crop; }
      if (!first) {
        if (img) this.transitionNormal = new ResourceTransition(this.item.resourcesTransitionTime, prevN, this.image);
        if (over) this.transitionOver = new ResourceTransition(this.item.resourcesTransitionTime, prevO, this.imageOver);
      }
      this.width = Math.max(this.ovr ? this.ovr.W : 0, this.nrm ? this.nrm.W : 0);
      this.height = Math.max(this.ovr ? this.ovr.H : 0, this.nrm ? this.nrm.H : 0);
      if (this.resources.assets.has('icon')) this.icon = a.image(this.resources.assets.get('icon'));
    }
    updateResources() {
      if (this.item.isArea) return;
      const r = this.createResourcesBlock();
      if (r !== this.resources) this.loadImages(false);
    }
    getElement() { return this.item; }
    getItem() { return this.item; }
    getIconImage() { return this.icon; }
    getWidth() { return this.width; }
    getHeight() { return this.height; }
    update(l) {
      if (this.startCounting) {
        this.timeElapsed -= l;
        if (this.timeElapsed <= 0) { this.timeElapsed = 0; this.isMouseOver = false; this.startCounting = false; }
      }
      if (this.transitionNormal) this.transitionNormal.update(l);
      if (this.transitionOver) this.transitionOver.update(l);
    }
    getImageToPaint() {
      const o = this.isMouseOver && this.imageOver;
      const img = o ? (this.transitionOver ? this.transitionOver.last() : this.imageOver) : (this.transitionNormal ? this.transitionNormal.last() : this.image);
      const c = o ? this.ovr : this.nrm;
      if (c) { this.x1 = c.x1; this.x2 = c.x2; this.y1 = c.y1; this.y2 = c.y2; this.width = c.W; this.height = c.H; }
      return img;
    }
    draw() {
      const image = this.getImageToPaint();
      if (!image) return;
      const off = this.game.functionalScene.getOffsetX();
      const n = jround(this.x - (idiv(this.width, 2) - this.x1) * this.scale) - off;
      const n2 = jround(this.y - (this.height - this.y1) * this.scale);
      const img = E1.scaledImage(image, this.scale);
      const depth = this.layer === -1 ? jround(this.y) : this.layer;
      this.game.gui.addElementToDraw(img, n, n2, depth, jround(this.y), this.highlight, this);
    }
    isPointInside(f, f2) {
      if (this.item.behaviour === 1) return false;
      let bl = false;
      let n = trunc(f - (this.x - this.getWidth() * this.scale / 2));
      let n2 = trunc(f2 - (this.y - this.getHeight() * this.scale));
      if (n < this.x1 * this.scale || n2 < this.y1 * this.scale || n >= this.x2 * this.scale || n2 >= this.y2 * this.scale) return false;
      n -= trunc(this.x1 * this.scale);
      n2 -= trunc(this.y1 * this.scale);
      if (n >= 0 && n < (this.x2 - this.x1) * this.scale && n2 >= 0 && n2 < (this.y2 - this.y1) * this.scale) {
        const img = this.getImageToPaint();
        let n4 = trunc(n / this.scale), n5 = trunc(n2 / this.scale);
        if (n4 < 0) n4 = 0; if (n5 < 0) n5 = 0;
        if (n4 >= img.width) n4 = img.width - 1;
        if (n5 >= img.height) n5 = img.height - 1;
        bl = img.alpha(n4, n5) > 124;
      }
      if (bl) {
        this.isMouseOver = true;
        const fs = this.game.functionalScene;
        if (fs) fs.resetAllItems(this);
        this.startCounting = true; this.timeElapsed = 10000;
      } else { this.isMouseOver = false; this.startCounting = false; }
      return bl;
    }
    resetItem() { this.isMouseOver = false; this.startCounting = false; }
    canPerform(n) { return [0, 1, 3, 4, 5, 6, 7, 9, 10].includes(n); }
    isInInventory() { return this.game.itemSummary.isItemGrabbed(this.item.id); }
    examine() { return this.runAction(this.item.actions, (a) => a.type === 0); }
    canBeUsedAlone() {
      const a1 = this.getFirstValidAction(1), a2 = this.getFirstValidAction(3), a3 = this.getFirstValidAction(2);
      const bl7 = (!a1 || !a1.conditionsAreMeet) && (!a2 || !a2.conditionsAreMeet) && (!a3 || !a3.conditionsAreMeet);
      for (const a of this.item.actions) {
        if (a.type !== 4) continue;
        if (condOk(this.game, a.conditions)) return true;
        if (a.activatedNotEffects && bl7) return true;
      }
      return false;
    }
    canBeDragged() {
      for (const a of this.item.actions) {
        if (a.type !== 8) continue;
        if (condOk(this.game, a.conditions) || a.activatedNotEffects) return true;
      }
      return false;
    }
    getFirstValidAction(n) { return this.firstValidAction(this.item.actions, n); }
    getFirstValidCustomAction(s) { return this.firstValidCustom(this.item.actions, 5, s, false); }
    getFirstValidCustomInteraction(s) { return this.firstValidCustom(this.item.actions, 6, s, true); }
    grab() {
      const g = this.game;
      for (const a of this.item.actions) {
        if (a.type === 1 && condOk(g, a.conditions)) {
          if (!a.effects.some((e) => e.type === 4)) g.grabItem(this.item.id);
          g.storeAllEffects(a.effects);
          return true;
        }
      }
      for (const a of this.item.actions) if (a.type === 1 && a.activatedNotEffects) { g.storeAllEffects(a.notEffects); return true; }
      return false;
    }
    use() { return this.runAction(this.item.actions, (a) => a.type === 4); }
    custom(name) { return this.runAction(this.item.actions, (a) => a.type === 5 && a.name === name); }
    getInfluenceArea() { return null; }
    getReference() { return this.reference; }
  }

  class ResourceTransition {
    constructor(time, im1, im2) {
      this.time = time; this.im1 = im1; this.im2 = im2; this.elapsed = 0; this.started = false; this.finished = false; this.lastUpdate = null;
      this.w = Math.max(im1 ? im1.width : -1, im2 ? im2.width : -1);
      this.h = Math.max(im1 ? im1.height : -1, im2 ? im2.height : -1);
      if (im1 || im2) this.started = true;
    }
    update(l) {
      if (this.started && !this.finished) {
        this.elapsed += l;
        const f = this.elapsed < this.time ? this.elapsed / this.time : 1;
        const a = this.im1, b = this.im2;
        this.lastUpdate = E1.canvasImage(this.w, this.h, (g) => {
          if (a) { g.globalAlpha = 1 - f; g.drawImage(a.src, 0, 0); }
          if (b) { g.globalAlpha = f; g.drawImage(b.src, 0, 0); }
        });
        if (f === 1) { this.finished = true; this.lastUpdate = b; }
      }
    }
    last() {
      if (this.lastUpdate) return this.lastUpdate;
      if (!this.started) return this.im1;
      return this.finished ? this.im2 : this.im1;
    }
  }

  class FunctionalActiveArea extends FunctionalItem {
    constructor(game, area) {
      const item = { id: area.id, isArea: true, behaviour: 0, actions: area.actions, resources: [], descriptions: area.descriptions, resourcesTransitionTime: 0 };
      super(game, item, null, area.x + idiv(area.width, 2), area.y + area.height);
      this.activeArea = area;
    }
    getWidth() { return this.activeArea.width; }
    getHeight() { return this.activeArea.height; }
    getElement() { return this.activeArea; }
    draw() {}
    isPointInside(f, f2) {
      let bl;
      if (this.activeArea.rectangular) {
        const n = trunc(f - (this.x - idiv(this.getWidth(), 2)));
        const n2 = trunc(f2 - (this.y - this.getHeight()));
        bl = n >= 0 && n < this.getWidth() && n2 >= 0 && n2 < this.getHeight();
      } else bl = polygonContains(this.activeArea.points, f, f2);
      if (bl && this.game.functionalScene) this.game.functionalScene.resetAllItems(null);
      return bl;
    }
    grab() { return this.runAction(this.item.actions, (a) => a.type === 1); }
  }

  class FunctionalAtrezzo extends FunctionalElement {
    constructor(game, atrezzo, ref) {
      super(game, ref.x, ref.y);
      this.atrezzo = atrezzo; this.reference = ref; this.layer = ref.layer; this.scale = ref.scale;
      this.load();
    }
    load() {
      this.resources = resourcesBlock(this.game, this.atrezzo.resources, { name: '', conditions: null, fallback: true, assets: new Map([['image', 'gui/defaultassets/NRB_image.png']]) });
      const img = this.resources.assets.has('image') ? this.game.assets.image(this.resources.assets.get('image')) : null;
      this.c = img ? cropAtrezzo(img) : null;
    }
    updateResources() { const r = resourcesBlock(this.game, this.atrezzo.resources, null); if (r !== this.resources) this.load(); }
    getElement() { return this.atrezzo; }
    getReference() { return this.reference; }
    update() {}
    getWidth() { return this.c ? this.c.W : 0; }
    getHeight() { return this.c ? this.c.H : 0; }
    isPointInside() { return false; }
    canPerform() { return false; }
    getFirstValidAction() { return null; }
    draw() {
      if (!this.c) return;
      const c = this.c;
      const n = jround(this.x + c.x1 * this.scale - c.W * this.scale / 2) - this.game.functionalScene.getOffsetX();
      const n2 = jround(this.y + c.y1 * this.scale - c.H * this.scale);
      const img = E1.scaledImage(c.crop, this.scale);
      this.game.gui.addElementToDraw(img, n, n2, this.layer === -1 ? jround(this.y) : this.layer, jround(this.y), this.highlight, this);
    }
  }

  // ---------------------------------------------------------------- NPC
  function animSet(game, res, prefix) {
    const A = game.anims, a = res.assets;
    const r = a.get(prefix + 'right'), lft = a.get(prefix + 'left');
    return [
      A.load(a.get(prefix + 'up'), false),
      A.load(a.get(prefix + 'down'), false),
      !EMPTY(r) ? A.load(r, false) : A.load(lft, true),
      !EMPTY(lft) ? A.load(lft, false) : A.load(r, true),
    ];
  }
  class NPCState {
    constructor(npc) { this.npc = npc; this.animations = [null, null, null, null]; this.resetAnimation = false; this.loadResources(); }
    getCurrentAnimation() { return this.animations[this.npc.currentDirection] || this.animations[1]; }
    getImage() { return this.getCurrentAnimation().getImage(); }
    draw(n, n2, f, n3, fe) {
      const image = this.getImage();
      if (!image) return;
      const off = this.npc.game.functionalScene.getOffsetX();
      const n4 = trunc(n - image.width * f / 2 - off);
      const n5 = trunc(n2 - image.height * f);
      const img = E1.scaledImage(image, f);
      const gui = this.npc.game.gui;
      if (n3 === -1 || n3 === -2) gui.addPlayerToDraw(img, n4, n5, jround(n2), jround(n2));
      else gui.addElementToDraw(img, n4, n5, n3, jround(n2), null, fe);
    }
  }
  class NPCIdle extends NPCState {
    update() {}
    initialize() { if (this.npc.currentDirection === -1) this.npc.currentDirection = 1; this.npc.speedX = 0; this.npc.speedY = 0; }
    loadResources() { this.animations = animSet(this.npc.game, this.npc.resources, 'stand'); }
  }
  class NPCTalking extends NPCState {
    constructor(npc) { super(npc); this.text = null; this.audioId = -1; this.totalTime = 0; this.timeTalking = 0; this.keepShowing = false; }
    setText(s, keep) {
      this.text = s; this.keepShowing = keep;
      const f = this.npc.game.options.textSpeedFactor();
      this.timeTalking = trunc(300 * E1.jsplit(s, / /).length * f);
      if (this.timeTalking < trunc(1400 * f)) this.timeTalking = trunc(1400 * f);
    }
    setAudio(path) {
      const mm = this.npc.game.mm;
      if (this.audioId !== -1) { mm.stopPlaying(this.audioId); if (path == null) this.audioId = -1; }
      if (path != null) { this.audioId = mm.loadSound(path, false); mm.startPlaying(this.audioId); }
    }
    update(l) {
      this.totalTime += l;
      const mm = this.npc.game.mm;
      if (!(this.keepShowing || this.totalTime <= this.timeTalking || (this.audioId !== -1 && mm.isPlaying(this.audioId)))) this.npc.setState(0);
    }
    draw(n, n2, f, n3, fe) {
      super.draw(n, n2, f, n3, fe);
      if (this.text != null && this.text !== '') {
        const npc = this.npc, off = npc.game.functionalScene.getOffsetX();
        if (npc.npc.showsSpeechBubble) {
          npc.game.gui.addTextToDraw(this.text, n - off, n2 - jround(npc.getHeight() * f) - 15, npc.npc.textFront, npc.npc.textBorder, npc.npc.bubbleBkg, npc.npc.bubbleBorder, true);
        } else npc.game.gui.addTextToDraw(this.text, n - off, n2 - jround(npc.getHeight() * f), npc.npc.textFront, npc.npc.textBorder);
      }
    }
    initialize() {
      this.totalTime = 0;
      const g = this.npc.game;
      if (g.isTransparent() || g.functionalPlayer.getX() >= this.npc.getX()) this.npc.currentDirection = 2; else this.npc.currentDirection = 3;
    }
    loadResources() { this.animations = animSet(this.npc.game, this.npc.resources, 'speak'); }
  }
  class NPCWalking extends NPCState {
    update(l) {
      const npc = this.npc;
      let bl = false, bl2 = false;
      if ((npc.speedX > 0 && npc.x < npc.destX) || (npc.speedX <= 0 && npc.x >= npc.destX)) npc.x = Math.fround(npc.x + Math.fround(npc.speedX * l / 1000));
      else bl = true;
      if ((npc.speedY > 0 && npc.y < npc.destY) || (npc.speedY <= 0 && npc.y >= npc.destY)) {
        npc.y = Math.fround(npc.y + Math.fround(npc.speedY * l / 1000));
        if (bl && npc.y < npc.destY) npc.currentDirection = 1;
        else if (bl && npc.y >= npc.destY) npc.currentDirection = 0;
      } else bl2 = true;
      if (bl && bl2) { npc.setState(0); if (npc.currentDirection === -1) npc.currentDirection = 1; }
    }
    initialize() {
      const npc = this.npc;
      if (npc.x < npc.destX) { npc.currentDirection = 2; npc.speedX = 120; } else { npc.currentDirection = 3; npc.speedX = -120; }
      npc.speedY = npc.y < npc.destY ? 120 : -120;
    }
    loadResources() { this.animations = animSet(this.npc.game, this.npc.resources, 'walk'); }
  }
  const NPC_DEFAULT = {
    name: '', conditions: null, fallback: true,
    assets: new Map(['speakdown', 'speakup', 'speakright', 'walkdown', 'walkup', 'walkright', 'useright', 'standup', 'standdown', 'standright'].map((k) => [k, 'gui/defaultassets/NRB_animation'])),
  };
  class FunctionalNPC extends FunctionalElement {
    constructor(game, npc, ref) {
      super(game, ref.x, ref.y);
      this.npc = npc; this.reference = ref; this.layer = ref.layer; this.scale = ref.scale;
      this.speedX = 0; this.speedY = 0; this.destX = 0; this.destY = 0; this.currentDirection = -1;
      this.resources = resourcesBlock(game, npc.resources, NPC_DEFAULT);
      this.idle = new NPCIdle(this); this.talking = new NPCTalking(this); this.walking = new NPCWalking(this);
      this.currentState = this.idle;
      this.currentState.initialize();
    }
    getNPC() { return this.npc; }
    getElement() { return this.npc; }
    getReference() { return this.reference; }
    isAlwaysSynthesizer() { return this.npc.alwaysSynthesizer; }
    updateResources() {
      const r = resourcesBlock(this.game, this.npc.resources, NPC_DEFAULT);
      if (r !== this.resources) { this.resources = r; this.idle.loadResources(); this.talking.loadResources(); this.walking.loadResources(); }
    }
    curImage() { return this.currentState.getImage(); }
    getWidth() { const i = this.curImage(); return i ? i.width : 0; }
    getHeight() { const i = this.curImage(); return i ? i.height : 0; }
    draw() { this.currentState.draw(jround(this.x), jround(this.y), this.scale, this.layer, this); }
    update(l) { this.currentState.update(l); this.currentState.getCurrentAnimation().update(l); }
    isPointInside(f, f2) {
      let bl = false;
      const n = trunc(f - (this.x - this.getWidth() * this.scale / 2));
      const n2 = trunc(f2 - (this.y - this.getHeight() * this.scale));
      if (n >= 0 && n < this.getWidth() * this.scale && n2 >= 0 && n2 < this.getHeight() * this.scale) {
        const img = this.curImage();
        bl = img.alpha(trunc(n / this.scale), trunc(n2 / this.scale)) > 128;
      }
      if (bl && this.game.functionalScene) this.game.functionalScene.resetAllItems(null);
      return bl;
    }
    canPerform(n) { return [0, 2, 3, 4, 6, 8].includes(n); }
    setState(n) {
      this.currentState = n === 1 ? this.talking : n === 2 ? this.walking : this.idle;
      this.currentState.resetAnimation = true;
      this.currentState.initialize();
    }
    speak(s, keep) {
      if (s != null && s.startsWith('[]')) s = s.replace('[]', '[ ' + this.npc.id + ' ]');
      this.talking.setText(processText(this.game, s), !!keep);
      this.setState(1);
    }
    speakAudio(s, audio, keep) {
      if (s != null && s.startsWith('[]')) s = s.replace('[]', '[ ' + this.npc.id + ' ]');
      this.talking.setAudio(audio);
      this.talking.setText(processText(this.game, s), !!keep);
      this.setState(1);
      return this.talking.audioId;
    }
    stopTalking() { this.talking.setAudio(null); this.setState(0); }
    isTalking() { return this.currentState === this.talking; }
    examine() { return this.runAction(this.npc.actions, (a) => a.type === 0); }
    use() { return this.runAction(this.npc.actions, (a) => a.type === 4); }
    custom(name) { return this.runAction(this.npc.actions, (a) => a.type === 5 && a.name === name); }
    setDestiny(x, y) { this.destX = x; this.destY = y; }
    isWalking() { return this.currentState === this.walking; }
    setDirection(d) { this.currentDirection = d; }
    getFirstValidAction(n) {
      for (const a of this.npc.actions) if (a.type === n && condOk(this.game, a.conditions)) return a;
      for (const a of this.npc.actions) if (a.type === n && a.activatedNotEffects) return a;
      return null;
    }
    getFirstValidCustomAction(s) { return this.firstValidCustom(this.npc.actions, 5, s, false); }
    getFirstValidCustomInteraction(s) { return this.firstValidCustom(this.npc.actions, 6, s, true); }
  }

  // ---------------------------------------------------------------- player (transparent mode)
  class FunctionalPlayer extends FunctionalElement {
    constructor(game, player) {
      super(game, 0, 0);
      this.player = player; this.layer = -1; this.scale = 1; this.currentDirection = 2;
      this.resources = resourcesBlock(game, player.resources, null);
      this.actionPool = [];
      this.animationPool = [animSet(game, this.resources, 'stand')];
      this.isTransparentFlag = false;
    }
    isTransparent() { return this.isTransparentFlag; }
    getElement() { return this.player; }
    getResources() { return this.resources; }
    isAlwaysSynthesizer() { return this.player.alwaysSynthesizer; }
    updateResources() {
      const r = resourcesBlock(this.game, this.player.resources, null);
      if (r !== this.resources) { this.resources = r; this.animationPool = [animSet(this.game, r, 'stand')]; }
    }
    getCurrentAnimation() {
      const set = this.animationPool[this.animationPool.length - 1];
      return (this.currentDirection >= 0 && this.currentDirection < 4) ? set[this.currentDirection] : set[0];
    }
    getWidth() { const i = this.getCurrentAnimation().getImage(); return i ? i.width : 0; }
    getHeight() { const i = this.getCurrentAnimation().getImage(); return i ? i.height : 0; }
    addAction(a) { this.actionPool.push(a); }
    cancelActions() { this.getCurrentAction().stop(); this.actionPool.length = 0; this.cancelAnimations(); }
    getCurrentAction() { return this.actionPool.length ? this.actionPool[this.actionPool.length - 1] : new NullAction(); }
    popAction() { if (this.actionPool.length) this.actionPool.pop(); }
    setAnimation(set, n) {
      if (n !== -1) this.animationPool.push(set);
      else { if (this.animationPool.length > 1) this.animationPool.pop(); this.animationPool.push(set); }
    }
    popAnimation() { if (this.animationPool.length > 1) this.animationPool.pop(); }
    cancelAnimations() { if (this.animationPool.length) this.animationPool = [this.animationPool[0]]; }
    setDirection(d) { this.currentDirection = d; }
    performActionInElement(fe) {
      const g = this.game, n = g.actionManager.getActionSelected();
      if (n === 0) { this.addAction(new LookAction(fe)); return; }
      let fa = new NullAction();
      switch (n) {
        case 3: this.cancelActions(); fa = new ExamineAction(fe); break;
        case 1:
          this.cancelActions();
          if (fe.canPerform(n) && !fe.isInInventory()) fa = new GrabAction(fe);
          break;
        case 2:
          this.cancelActions();
          if (fe.canPerform(n)) fa = new TalkAction(fe);
          break;
        case 4:
          if (fe.canPerform(n)) {
            if (fe.canBeUsedAlone()) { this.cancelActions(); fa = new UseAction(fe); }
          } else this.popAction();
          break;
        case 9: fa = new CustomAction(fe, g.actionManager.getCustomActionName()); break;
        default: break;
      }
      if (fa.noOriginalActionType() || fa.hasOriginalAction()) { this.addAction(fa); return; }
      g.actionManager.setActionSelected(-1);
    }
    draw() {
      const a = this.getCurrentAction();
      if (a.isStarted() && !a.isFinished()) a.drawAditionalElements();
    }
    update(l) {
      while (this.getCurrentAction().isFinished()) this.popAction();
      const a = this.getCurrentAction();
      if (!a.isStarted()) a.start(this); else a.update(l);
      this.getCurrentAnimation().update(l);
    }
    isPointInside() { return false; }
    canPerform(n) { return n === 0 || n === 3 || n === 9; }
    speak(s, keep) {
      if (s != null && s.startsWith('[]')) s = s.replace('[]', '[ ' + this.game.strings.get('DebugFrameLog.Player') + ' ]');
      if (s != null) this.addAction(new SpeakAction(s, null, !!keep));
    }
    speakAudio(s, audio, keep) {
      if (s != null && s.startsWith('[]')) s = s.replace('[]', '[ Player ]');
      const sp = new SpeakAction(s, audio, !!keep);
      this.addAction(sp);
      return sp.audioId;
    }
    stopTalking() { if (this.getCurrentAction().type === 2) { this.getCurrentAction().stop(); this.cancelActions(); } }
    isTalking() { return this.getCurrentAction().type === 2; }
    isWalking() { return this.getCurrentAction().type === 6; }
    getFirstValidAction() { return null; }
  }

  // ---------------------------------------------------------------- player actions
  class FAction {
    constructor() { this.originalAction = null; this.fp = null; this.finished = false; this.type = -1; this.needsGoTo = false; this.keepDistance = 0; }
    isStarted() { return this.fp != null; }
    isFinished() { return this.finished; }
    hasOriginalAction() { return this.originalAction != null; }
    noOriginalActionType() { return this.type === 2 || this.type === 5 || this.type === 3; }
    stop() { this.finished = true; }
    update() {}
    drawAditionalElements() {}
  }
  class NullAction extends FAction {
    constructor() { super(); this.type = -1; }
    start(p) { this.fp = p; }
    stop() {}
  }
  class LookAction extends FAction {
    constructor(el) { super(); this.type = 0; this.el = el; }
    start(p) {
      const g = p.game, d = description(g, this.el.getElement().descriptions);
      this.fp = p;
      if (this.el.isInInventory()) p.setDirection(1); else if (this.el.getX() < p.getX()) p.setDirection(3); else p.setDirection(2);
      this.finished = true;
      if (d.briefSound) p.speakAudio(d.brief, d.briefSound, false); else p.speak(d.brief, g.descriptor.keepShowing);
    }
  }
  class ExamineAction extends FAction {
    constructor(el) {
      super(); this.type = 3; this.el = el;
      this.originalAction = el.getFirstValidAction(0);
    }
    start(p) {
      const g = p.game, d = description(g, this.el.getElement().descriptions);
      this.fp = p;
      if (!this.el.examine()) {
        if (d.detailedSound) p.speakAudio(d.detailed, d.detailedSound, false); else p.speak(d.detailed, g.descriptor.keepShowing);
      }
      this.finished = true;
    }
  }
  class SpeakAction extends FAction {
    constructor(text, audio, keep) {
      super(); this.type = 2; this.keepShowing = keep; this.audioId = -1; this.audio = audio; this.totalTime = 0; this.text = text;
      this.audioDelay = audio ? 500 : 0;
    }
    start(p) {
      this.fp = p; this.totalTime = 0;
      const g = p.game;
      this.text = processText(g, this.text);
      const f = g.options.textSpeedFactor();
      this.timeTalking = trunc(300 * E1.jsplit(this.text, / /).length * f);
      if (this.timeTalking < trunc(1400 * f)) this.timeTalking = trunc(1400 * f);
      if (this.audio) { this.audioId = g.mm.loadSound(this.audio, false); }
      p.setAnimation(animSet(g, p.getResources(), 'speak'), -1);
    }
    update(l) {
      this.totalTime += l;
      const mm = this.fp.game.mm;
      if (this.audioDelay > 0) { this.audioDelay -= l; if (this.audioDelay <= 0) mm.startPlaying(this.audioId); }
      if (!(this.keepShowing || this.totalTime <= this.timeTalking || this.audioDelay > 0 || (this.audioId !== -1 && mm.isPlaying(this.audioId)))) {
        this.finished = true; this.fp.popAnimation();
      }
    }
    drawAditionalElements() {
      if (this.text == null || this.text === '') return;
      const p = this.fp, g = p.game, off = g.functionalScene.getOffsetX();
      let n2, n;
      if (!p.isTransparent()) { n2 = trunc(p.getX()) - off; n = trunc(p.getY() - p.getHeight() * p.getScale()); }
      else { n2 = jround(400 + off); n = jround(100 + p.getHeight()); }
      const pl = p.player;
      if (pl.showsSpeechBubble) g.gui.addTextToDraw(this.text, n2, n - 15, pl.textFront, pl.textBorder, pl.bubbleBkg, pl.bubbleBorder, !p.isTransparent());
      else g.gui.addTextToDraw(this.text, n2, n, pl.textFront, pl.textBorder);
    }
    stop() { if (this.isStarted() && this.audioId !== -1) this.fp.game.mm.stopPlaying(this.audioId); this.audioDelay = 0; }
  }
  class GrabAction extends FAction {
    constructor(el) {
      super(); this.type = 1; this.el = el; this.totalTime = 0; this.canGrab = false;
      this.originalAction = el.getFirstValidAction(1);
    }
    start(p) {
      this.fp = p;
      p.setDirection(p.getX() < this.el.getX() ? 2 : 3);
      p.setAnimation(useSet(p), -1);
      this.finished = false;
    }
    update(l) {
      this.totalTime += l;
      if (!this.finished && !this.canGrab) {
        this.canGrab = this.el.grab();
        if (!this.canGrab) { this.finished = true; this.fp.popAnimation(); }
      } else if (!this.finished && this.totalTime > 1000) { this.finished = true; this.fp.popAnimation(); }
    }
  }
  function useSet(p) {
    const A = p.game.anims, a = p.getResources().assets;
    const r = a.get('useright'), lft = a.get('useleft');
    return [A.load(r, false), A.load(r, true), !EMPTY(r) ? A.load(r, false) : A.load(lft, true), !EMPTY(lft) ? A.load(lft, false) : A.load(r, true)];
  }
  class UseAction extends FAction {
    constructor(el) {
      super(); this.type = 4; this.el = el; this.totalTime = 0; this.canUse = false;
      this.originalAction = el.getFirstValidAction(4);
    }
    start(p) {
      this.fp = p; this.finished = false; this.totalTime = 0;
      p.setDirection(p.getX() < this.el.getX() ? 2 : 3);
      p.setAnimation(useSet(p), -1);
    }
    update(l) {
      this.totalTime += l;
      if (!this.finished && !this.canUse) {
        this.canUse = this.el.use();
        if (!this.canUse) { this.fp.popAnimation(); this.finished = true; }
      } else if (!this.finished && this.totalTime > 1000) { this.finished = true; this.fp.popAnimation(); }
    }
  }
  class TalkAction extends FAction {
    constructor(el) {
      super(); this.type = 2; this.npc = el; this.any = false;
      for (const a of el.npc.actions) if (a.type === 7 && condOk(el.game, a.conditions)) { this.any = true; break; }
    }
    start(p) {
      this.fp = p;
      if (this.any) { p.setDirection(this.npc.getX() > p.getX() ? 2 : 3); this.finished = false; } else this.finished = true;
    }
    update() {
      const g = this.npc.game;
      for (const a of this.npc.npc.actions) {
        if (a.type === 7 && condOk(g, a.conditions)) { g.currentNPC = this.npc; g.storeAllEffects(a.effects); break; }
      }
      this.finished = true;
    }
    stop() { this.finished = true; }
  }
  class CustomAction extends FAction {
    constructor(el, name) {
      super(); this.type = 5; this.el = el; this.name = name; this.totalTime = 0; this.hasAnimation = false;
      this.originalAction = el.getFirstValidCustomAction(name);
    }
    start(p) {
      this.fp = p;
      p.setDirection(this.el.getX() > p.getX() ? 2 : 3);
      p.setAnimation(useSet(p), -1);
      this.hasAnimation = true; this.totalTime = 0; this.finished = false;
    }
    update(l) {
      this.totalTime += l;
      if (this.totalTime > 1000) {
        this.finished = true;
        if (this.hasAnimation) this.fp.popAnimation();
        if (this.el.custom) this.el.custom(this.name);
      }
    }
  }
  class ExitAction extends FAction {
    constructor(exit) { super(); this.exit = exit; this.type = -1; }
    start(p) {
      this.fp = p;
      const g = p.game, ex = this.exit;
      if (ex) {
        if (condOk(g, ex.conditions)) {
          const list = buildEffects(g, ex.effects);
          list.push(new NextSceneEffect(g, ex));
          g.storeEffectsInQueue(list, false);
        } else if (ex.hasNotEffects) g.storeAllEffects(ex.notEffects);
      }
      this.finished = true;
    }
  }

  // ===================================================================== effects
  class FEffect {
    constructor(game, e) { this.game = game; this.effect = e; }
    isAllConditionsOK() { return this.effect ? condOk(this.game, this.effect.conditions) : true; }
    canSkip() { return false; }
    skip() {}
    getTriggerEffect() { return null; }
    isInstantaneous() { return true; }
    isStillRunning() { return false; }
  }
  class SimpleEffect extends FEffect {
    triggerEffect() {
      const g = this.game, e = this.effect;
      switch (e.type) {
        case 0: g.flags.activateFlag(e.target); g.updateDataPendingFromState(false); break;
        case 1: g.flags.deactivateFlag(e.target); g.updateDataPendingFromState(false); break;
        case 17: g.vars.setVarValue(e.target, e.value); g.updateDataPendingFromState(false); break;
        case 18: g.vars.incrementVar(e.target, e.value); g.updateDataPendingFromState(false); break;
        case 19: g.vars.decrementVar(e.target, e.value); g.updateDataPendingFromState(false); break;
        case 2: g.consumeItem(e.target); break;
        case 3: g.generateItem(e.target); break;
        default: break;
      }
    }
  }
  class MacroEffect extends FEffect {
    constructor(g, e) { super(g, e); this.triggered = false; }
    triggerEffect() {
      if (this.triggered) return;
      const m = this.game.chapter.macros.get(this.effect.target);
      this.game.storeEffectsInQueue(m ? buildEffects(this.game, m.effects, true) : [], false);
      this.triggered = true;
    }
  }
  class MoveNPCEffect extends FEffect {
    triggerEffect() {
      const npc = this.game.functionalScene.getNPC(this.effect.target);
      if (npc) { npc.setDestiny(this.effect.x, this.effect.y); npc.setState(2); }
    }
    isInstantaneous() { return false; }
    isStillRunning() { const npc = this.game.functionalScene.getNPC(this.effect.target); return npc ? npc.isWalking() : false; }
  }
  class PlaySoundEffect extends FEffect {
    triggerEffect() {
      if (this.game.options.isEffectsActive()) { this.soundID = this.game.mm.loadSound(this.effect.path, false); this.game.mm.startPlaying(this.soundID); }
      else this.soundID = -1;
    }
    isInstantaneous() { return this.effect.background; }
    isStillRunning() { return !this.effect.background && this.game.mm.isPlaying(this.soundID); }
  }
  class SpeakEffect extends FEffect {
    triggerEffect() {
      const g = this.game, e = this.effect;
      if (e.type === 6) {
        const npc = g.functionalScene.getNPC(e.target);
        if (!npc) return;
        if (e.audio) npc.speakAudio(e.line, e.audio, g.descriptor.keepShowing); else npc.speak(e.line, g.descriptor.keepShowing);
        g.characterCurrentlyTalking = npc;
      } else {
        if (!condOk(g, e.conditions)) return;
        const p = g.functionalPlayer;
        if (e.audio) p.speakAudio(e.line, e.audio, g.descriptor.keepShowing); else p.speak(e.line, g.descriptor.keepShowing);
        g.characterCurrentlyTalking = p;
      }
    }
    isInstantaneous() { return false; }
    isStillRunning() {
      const g = this.game;
      if (g.characterCurrentlyTalking && !g.characterCurrentlyTalking.isTalking()) g.characterCurrentlyTalking = null;
      return g.characterCurrentlyTalking != null;
    }
    canSkip() { return true; }
    skip() {
      const g = this.game;
      if (g.characterCurrentlyTalking && g.characterCurrentlyTalking.isTalking()) g.characterCurrentlyTalking.stopTalking();
      g.characterCurrentlyTalking = null;
    }
  }
  class TriggerEffect extends FEffect {
    triggerEffect() {
      const g = this.game, e = this.effect;
      switch (e.type) {
        case 7: g.setBook(e.target); g.setState(6); break;
        case 12: g.setConversation(e.target); g.setState(7); break;
        case 13:
          if (g.chapter.cutscenes.has(e.target)) { g.setNextScene(newExit(e.target)); g.setState(3); }
          break;
        case 15: {
          const last = g.lastNextScene;
          const id = last ? last.nextSceneId : null;
          if (id != null && !g.chapter.cutscenes.has(id)) {
            const ex = newExit(id); ex.destinyX = last ? last.destinyX : MIN_INT; ex.destinyY = last ? last.destinyY : MIN_INT;
            g.setNextScene(ex); g.setState(3);
          }
          break;
        }
        case 14:
          if (e.target != null && !g.chapter.cutscenes.has(e.target)) {
            const ex = newExit(e.target); ex.destinyX = e.x; ex.destinyY = e.y;
            g.setNextScene(ex); g.setState(3);
          }
          break;
        default: break;
      }
    }
    isInstantaneous() { return false; }
  }
  class WaitTimeEffect extends FEffect {
    constructor(g, e) { super(g, e); this.running = false; this.until = 0; }
    triggerEffect() { this.running = true; this.until = performance.now() + this.effect.time * 1000; }
    isInstantaneous() { return false; }
    isStillRunning() { if (this.running && performance.now() >= this.until) this.running = false; return this.running; }
  }
  class NextSceneEffect extends FEffect {
    constructor(g, exit) { super(g, null); this.exit = exit; }
    triggerEffect() { this.game.setNextScene(this.exit); this.game.setState(3); }
    isInstantaneous() { return false; }
  }
  function newExit(id) {
    return { x: 0, y: 0, width: 0, height: 0, rectangular: true, points: [], nextSceneId: id, destinyX: MIN_INT, destinyY: MIN_INT,
      transitionType: 0, transitionTime: 0, hasNotEffects: false, look: null, conditions: null, effects: [], notEffects: [], postEffects: [] };
  }
  function buildEffect(g, e) {
    switch (e.type) {
      case 0: case 1: case 2: case 3: case 17: case 18: case 19: return new SimpleEffect(g, e);
      case 20: return new MacroEffect(g, e);
      case 11: return new MoveNPCEffect(g, e);
      case 8: return new PlaySoundEffect(g, e);
      case 5: case 6: return new SpeakEffect(g, e);
      case 7: case 12: case 13: case 14: case 15: return new TriggerEffect(g, e);
      case 21: return new WaitTimeEffect(g, e);
      default: return null;
    }
  }
  // FunctionalEffects(effects).getEffects(); macros keep nulls like the original (filtered later as null entries)
  function buildEffects(g, list, keepNulls) {
    const out = [];
    for (const e of list || []) { const f = buildEffect(g, e); if (f || keepNulls) out.push(f); }
    return out;
  }

  // ===================================================================== timers
  class TimerManager {
    constructor(game) { this.game = game; this.timers = []; }
    reset() { this.timers = []; }
    addTimer(t, listener) {
      this.timers.push({
        lastUpdate: 0, timeUpdate: t.time, notifyUpdates: true, init: t.initCond, end: t.endCond, listener, state: 0,
        usesEndCondition: t.usesEndCondition, runsInLoop: t.runsInLoop, multipleStarts: t.multipleStarts,
        showTime: t.showTime, countDown: t.countDown, name: t.displayName, showWhenStopped: t.showWhenStopped, data: t,
      });
      return this.timers.length - 1;
    }
    update(bl) {
      const g = this.game, l = Math.floor(Date.now() / 1000);
      for (let i = 0; i < this.timers.length; i++) {
        const t = this.timers[i];
        if (t.state === 0 || (t.multipleStarts && t.state === 2)) {
          if (!condOk(g, t.init) || (t.usesEndCondition && condOk(g, t.end))) continue;
          t.lastUpdate = l; t.state = 1;
          continue;
        }
        if (t.state !== 1) continue;
        if ((t.usesEndCondition && condOk(g, t.end)) || (!t.usesEndCondition && !condOk(g, t.init))) {
          t.lastUpdate = l; t.state = 2;
          g.storeAllEffects(t.data.postEffects);
          continue;
        }
        const l2 = l - t.lastUpdate;
        if (!bl || l2 < t.timeUpdate || !t.notifyUpdates) continue;
        if (!t.runsInLoop) t.state = 2;
        t.lastUpdate = l;
        g.storeAllEffects(t.data.effects);
        if (!t.runsInLoop) g.storeAllEffects(t.data.postEffects);
      }
    }
    getTime(t) {
      const now = Math.floor(Date.now() / 1000);
      if (t.state === 1) return t.countDown ? t.timeUpdate - (now - t.lastUpdate) : now - t.lastUpdate;
      return t.countDown ? t.timeUpdate : 0;
    }
    draw(gui) {
      const lines = [];
      for (const t of this.timers) {
        if (!t.showTime || (!t.showWhenStopped && t.state !== 1)) continue;
        let s = t.name; if (s.length > 0) s += ' : ';
        const v = this.getTime(t);
        s += Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
        lines.push(s);
      }
      if (lines.length) gui.drawStringLines(lines, 800, 0, '#ffffff', '#000000');
    }
  }

  // ===================================================================== scene
  class FunctionalScene {
    constructor(game, scene, player, musicId) {
      this.game = game; this.scene = scene; this.player = player;
      this.items = []; this.npcs = []; this.atrezzo = []; this.areas = []; this.offsetX = 0;
      this.backgroundMusicId = musicId === undefined ? -1 : musicId;
      this.resources = this.createResourcesBlock();
      this.loadBackground();
      if (this.backgroundMusicId === -1) this.playBackgroundMusic();
      this.restartElementReferencesPositions();
      for (const a of scene.activeAreas) if (condOk(game, a.conditions)) this.areas.push(new FunctionalActiveArea(game, a));
      for (const r of scene.atrezzoRefs) {
        if (!condOk(game, r.conditions)) continue;
        const at = game.chapter.atrezzo.get(r.target);
        if (at) this.atrezzo.push(new FunctionalAtrezzo(game, at, r));
      }
    }
    loadBackground() {
      const a = this.game.assets, res = this.resources.assets;
      this.background = res.has('background') ? a.image(res.get('background')) : null;
      this.foreground = (this.background && res.has('foreground')) ? a.image('fg:' + res.get('background') + '|' + res.get('foreground')) : null;
    }
    createResourcesBlock() {
      return resourcesBlock(this.game, this.scene.resources, { name: '', conditions: null, fallback: true, assets: new Map([['background', 'gui/defaultassets/NRB_background.jpg']]) });
    }
    restartElementReferencesPositions() {
      const g = this.game;
      this.itemReferences = []; this.npcReferences = []; this.items = []; this.npcs = [];
      for (const r0 of this.scene.itemRefs) {
        const r = Object.assign({}, r0);
        this.itemReferences.push(r);
        if (!condOk(g, r0.conditions) || !g.itemSummary.isItemNormal(r0.target)) continue;
        const it = g.chapter.items.get(r0.target);
        if (it) this.items.push(new FunctionalItem(g, it, r));
      }
      for (const r0 of this.scene.charRefs) {
        const r = Object.assign({}, r0);
        this.npcReferences.push(r);
        if (!condOk(g, r0.conditions)) continue;
        const c = g.chapter.characters.get(r0.target);
        if (c) this.npcs.push(new FunctionalNPC(g, c, r));
      }
    }
    updateScene() {
      const g = this.game;
      this.updateResources();
      this.player.updateResources();
      for (const r of this.itemReferences) {
        if (condOk(g, r.conditions)) {
          let found = false;
          for (const fi of this.items) { fi.updateResources(); if (fi.getReference() === r) found = true; }
          if (found || !g.itemSummary.isItemNormal(r.target)) continue;
          const it = g.chapter.items.get(r.target);
          if (it) this.items.push(new FunctionalItem(g, it, r));
          continue;
        }
        let fe = null;
        for (const fi of this.items) if (fi.getReference() === r) fe = fi;
        if (!fe) continue;
        r.x = trunc(fe.getX()); r.y = trunc(fe.getY());
        this.items.splice(this.items.indexOf(fe), 1);
      }
      for (const r of this.npcReferences) {
        if (condOk(g, r.conditions)) {
          let found = false;
          for (const n of this.npcs) { n.updateResources(); if (n.getReference() === r) found = true; }
          if (found) continue;
          const c = g.chapter.characters.get(r.target);
          if (c) this.npcs.push(new FunctionalNPC(g, c, r));
          continue;
        }
        let fe = null;
        for (const n of this.npcs) if (n.getReference() === r) fe = n;
        if (fe) this.npcs.splice(this.npcs.indexOf(fe), 1);
      }
      for (const a of this.scene.activeAreas) {
        if (!condOk(g, a.conditions)) continue;
        if (this.areas.some((fa) => fa.activeArea.id === a.id)) continue;
        this.areas.push(new FunctionalActiveArea(g, a));
      }
      for (const r of this.scene.atrezzoRefs) {
        if (condOk(g, r.conditions)) {
          let found = false;
          for (const fa of this.atrezzo) {
            if (r.target !== fa.atrezzo.id) continue;
            fa.updateResources();
            if (fa.getReference() === r) found = true;
          }
          if (found) continue;
          const at = g.chapter.atrezzo.get(r.target);
          if (at) this.atrezzo.push(new FunctionalAtrezzo(g, at, r));
          continue;
        }
        let fe = null;
        for (const fa of this.atrezzo) if (fa.getReference() === r) fe = fa;
        if (fe) this.atrezzo.splice(this.atrezzo.indexOf(fe), 1);
      }
      const rm = [];
      for (const fa of this.areas) {
        let ok = false;
        for (const a of this.scene.activeAreas) if (a.id === fa.activeArea.id && condOk(g, a.conditions)) ok = true;
        if (!ok) rm.push(fa);
      }
      for (const fa of rm) this.areas.splice(this.areas.indexOf(fa), 1);
    }
    updateResources() {
      const r = this.createResourcesBlock();
      if (r !== this.resources) { this.resources = r; this.loadBackground(); this.playBackgroundMusic(); }
    }
    getScene() { return this.scene; }
    getNPC(id) {
      let r = null;
      if (id != null) for (const n of this.npcs) if (n.npc.id === id) r = n;
      return r;
    }
    getItems() { return this.items; }
    getOffsetX() { return this.offsetX; }
    update(l) {
      this.playBackgroundMusic();
      for (const it of this.items) it.update(l);
      for (const a of this.areas) a.update(l);
      for (const n of this.npcs) n.update(l);
      this.player.update(l);
    }
    draw() {
      const gui = this.game.gui;
      gui.addBackgroundToDraw(this.background, this.offsetX);
      for (const it of this.items) it.draw();
      for (const n of this.npcs) n.draw();
      for (const a of this.atrezzo) a.draw();
      this.player.draw();
      if (this.foreground) gui.addForegroundToDraw(this.foreground, this.offsetX);
    }
    getElementInside(n, n2, exclude) {
      let found = null;
      const list = this.game.gui.getElementsToInteract();
      for (let i = list.length - 1; i >= 0 && found == null; i--) {
        const e = list[i];
        if (this.isExclude(e, exclude) || !e.isPointInside(n + this.offsetX, n2)) continue;
        found = e;
      }
      for (let i = 0; i < this.areas.length && found == null; i++) {
        const a = this.areas[i];
        if (this.isExclude(a, exclude) || !a.isPointInside(n + this.offsetX, n2)) continue;
        found = a;
      }
      return found;
    }
    isExclude(e, other) { return other != null && e === other; }
    getExitInside(n, n2) {
      for (const ex of this.scene.exits) {
        if (!exitInside(ex, n + this.offsetX, n2) || (!condOk(this.game, ex.conditions) && !ex.hasNotEffects)) continue;
        return ex;
      }
      return null;
    }
    mouseClicked(n, n2) {
      const g = this.game;
      const fe = this.getElementInside(n + this.offsetX, n2, null);
      if (g.actionManager.getActionSelected() === 6 || fe == null) {
        const n4 = n + this.offsetX, n5 = n2;
        const exit = this.getExitInside(n4 - this.offsetX, n5);
        this.player.cancelActions();
        if (this.player.isTransparent()) this.player.addAction(new ExitAction(exit));
        g.actionManager.setActionSelected(6);
      } else g.functionalPlayer.performActionInElement(fe);
    }
    stopBackgroundMusic() { this.game.mm.stopPlaying(this.backgroundMusicId); }
    playBackgroundMusic() {
      const g = this.game;
      if (!g.options.isMusicActive()) return;
      const res = this.resources.assets;
      if (res.has('bgmusic')) {
        if (!g.mm.isPlaying(this.backgroundMusicId)) {
          this.backgroundMusicId = g.mm.loadMusic(res.get('bgmusic'), true);
          g.mm.startPlaying(this.backgroundMusicId);
        }
      } else g.mm.stopPlayingMusic();
    }
    resetAllItems(except) { for (const it of this.items) { if (except != null && it === except) continue; it.resetItem(); } }
  }

  Object.assign(E1, {
    FlagSummary, VarSummary, ItemSummary, Inventory, FunctionalScene, FunctionalItem, FunctionalNPC, FunctionalPlayer,
    FunctionalActiveArea, FunctionalAtrezzo, TimerManager, buildEffects, buildEffect, newExit, processText, resourcesBlock,
    animSet, EMPTY, SpeakAction,
  });
})(typeof window !== 'undefined' ? window : globalThis);

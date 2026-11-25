/* EVONG web: GUI (draw lists, text, balloons), contextual HUD, action buttons, inventory. */
(function (global) {
  'use strict';
  const E1 = global.E1;
  const trunc = Math.trunc;
  const idiv = (a, b) => trunc(a / b);

  // ===================================================================== balloon factory
  const BF = { marginTop: 2, padding: 15, roundRadius: 10, maxLineWidth: 0, linesHeight: 0, position: 'NORTH' };
  function getLines(font, s, d, n) {
    BF.maxLineWidth = 0; BF.linesHeight = 0;
    const n3 = font.widthInt(s);
    const n2 = font.height + BF.marginTop;
    let d2 = Math.pow(idiv(n3, n2), d) * n2;
    d2 = d2 > n ? n : d2;
    d2 = d2 < idiv(n, 3) ? idiv(n, 3) : d2;
    const out = [];
    const words = E1.jsplit(s, / /);
    let line = '', i = 0, w = 0;
    while (i < words.length) {
      const ww = font.widthInt(words[i] + ' ');
      if (w + ww <= d2) { w += ww; line += words[i++] + ' '; continue; }
      if (line !== '') { out.push(line); BF.maxLineWidth = Math.max(BF.maxLineWidth, w); w = 0; line = ''; continue; }
      line = splitLongWord(font, out, words[i++], d2);
    }
    if (line !== '') { out.push(line); BF.maxLineWidth = Math.max(BF.maxLineWidth, w); }
    BF.linesHeight += (font.height + BF.marginTop) * out.length - BF.marginTop;
    return out;
  }
  function splitLongWord(font, out, word, d) {
    let s = '', n = 0;
    for (;;) {
      s = '';
      while (n < word.length && font.widthInt(s) < d) s += word.charAt(n++);
      if (n === word.length) return s;
      out.push(s);
      BF.maxLineWidth = Math.max(BF.maxLineWidth, font.widthInt(s));
    }
  }
  const rect = (x, y, w, h) => ({ x, y, w, h });
  const rcontains = (r, x, y) => r.w >= 0 && r.h >= 0 && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  function insideBounds(r, W, H) { return r.x > 0 && r.y > 0 && r.x + r.w <= W && r.h <= H; }
  function correctH(r, W, H) { if (r.x < 0) r.x = 2; if (r.x + r.w > W) r.x = W - r.w - 2; return insideBounds(r, W, H); }
  function correctV(r, W, H) { if (r.y < 0) r.y = 2; if (r.y + r.h > H) r.y = H - r.h - 2; return insideBounds(r, W, H); }
  function pad(r) { r.x -= BF.padding; r.y -= BF.padding; r.h += BF.padding * 2; r.w += BF.padding * 2; return r; }
  function getTextBounds(n, n2, W, H) {
    const mlw = BF.maxLineWidth, lh = BF.linesHeight;
    let r = rect(n - idiv(mlw, 2), n2 - lh, mlw, lh);
    if (correctH(r, W, H) && !rcontains(r, n, n2)) { BF.position = 'NORTH'; return pad(r); }
    r = rect(n - r.w - 60, n2, mlw, lh);
    if (correctV(r, W, H) && !rcontains(r, n, n2)) { BF.position = 'WEST'; return pad(r); }
    r = rect(n + 60, n2, mlw, lh);
    if (correctV(r, W, H) && !rcontains(r, n, n2)) { BF.position = 'EAST'; return pad(r); }
    r = rect(n - idiv(mlw, 2), n2 + lh + 50, mlw, lh);
    BF.position = 'SOUTH';
    correctH(r, W, H);
    return pad(r);
  }
  function normalPath(g, r) {
    const R = BF.roundRadius;
    g.beginPath();
    g.moveTo(r.x + R, r.y);
    g.lineTo(r.x + r.w - R, r.y);
    g.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + R);
    g.lineTo(r.x + r.w, r.y + r.h - R);
    g.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - R, r.y + r.h);
    g.lineTo(r.x + R, r.y + r.h);
    g.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - R);
    g.lineTo(r.x, r.y + R);
    g.quadraticCurveTo(r.x, r.y, r.x + R, r.y);
    g.closePath();
  }
  function arrowPoints(n, n2) {
    const lh = BF.linesHeight;
    switch (BF.position) {
      case 'NORTH': return [[n - 15, n2 + 15], [n - 3, n2 + 30], [n, n2 + 15]];
      case 'WEST': return [[n - 45, n2 + 15], [n - 33, n2 + 30], [n - 45, n2 + 32]];
      case 'EAST': return [[n + 46, n2 + 15], [n + 34, n2 + 30], [n + 46, n2 + 32]];
      default: { const dy = 50 + lh - 29; return [[n - 15, n2 + 15 + dy], [n - 3, n2 - 15 + dy], [n, n2 + 15 + dy]]; }
    }
  }

  // GUI.Text
  class Text {
    constructor(gui, s, x, y, front, border, bkg, bubbleBorder, showArrow) {
      this.text = s; this.x = x; this.y = y; this.front = front; this.border = border;
      this.showBubble = bkg !== undefined; this.bkg = bkg; this.bubbleBorder = bubbleBorder; this.showArrow = showArrow !== false;
      const f = gui.font;
      this.lines = getLines(f, s, 0.66, 800);
      this.bounds = getTextBounds(x, y, 800, 600);
      this.arrow = arrowPoints(x, y);
    }
    draw(gui) {
      const g = gui.g, f = gui.font, b = this.bounds;
      if (this.showBubble) {
        g.save();
        g.globalAlpha = 0.8;
        normalPath(g, b);
        g.fillStyle = this.bkg; g.fill();
        g.translate(0.5, 0.5);
        normalPath(g, b);
        g.lineWidth = 1; g.strokeStyle = this.bubbleBorder; g.stroke();
        g.translate(-0.5, -0.5);
        if (this.showArrow) {
          const p = this.arrow;
          g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.lineTo(p[2][0], p[2][1]);
          g.fillStyle = this.bkg; g.fill();
          g.beginPath(); g.moveTo(p[0][0] + 0.5, p[0][1] + 0.5); g.lineTo(p[1][0] + 0.5, p[1][1] + 0.5); g.lineTo(p[2][0] + 0.5, p[2][1] + 0.5);
          g.strokeStyle = this.bubbleBorder; g.stroke();
        }
        g.restore();
      }
      let y = b.y + f.height + idiv(BF.padding, 2);
      for (const line of this.lines) {
        const w = f.stringWidth(line, true);
        const x = b.x + idiv(b.w - w, 2);
        gui.borderText(f, line, x, y, this.front, this.border);
        y += f.height + BF.marginTop;
      }
    }
  }

  // ===================================================================== GUI
  class GUI {
    constructor(game, canvas) {
      this.game = game; this.canvas = canvas; this.g = canvas.getContext('2d');
      this.font = new E1.JFont(18, false, 1.25);       // Dialog 18, WIDTH_SEMI_EXTENDED
      this.font.hinted = E1.HINTED_18;
      this.hudFont = new E1.JFont(16, true, 1.25);     // Font(null, BOLD, 16) semi-extended
      this.background = null; this.foreground = null;
      this.elementsToDraw = []; this.textToDraw = []; this.elementsToInteract = [];
      this.hud = null; this.transition = null; this.cursorKey = null; this.cursors = new Map();
      this.dpr = 1;
    }
    resize() {
      const dpr = Math.min(3, Math.max(1, global.devicePixelRatio || 1));
      const rect = this.canvas.getBoundingClientRect();
      const scale = rect.width > 0 ? rect.width / 800 : 1;
      const k = Math.max(1, Math.min(3, Math.round(dpr * scale * 4) / 4));
      if (k !== this.dpr || this.canvas.width !== Math.round(800 * k)) {
        this.dpr = k;
        this.canvas.width = Math.round(800 * k); this.canvas.height = Math.round(600 * k);
      }
    }
    begin() {
      const g = this.g;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.fillStyle = '#000'; g.fillRect(0, 0, 800, 600);
    }
    // ------------------------------------------------ draw lists
    addBackgroundToDraw(img, off) { this.background = img ? { img, off } : null; }
    addForegroundToDraw(img, off) { this.foreground = img ? { img, off } : null; }
    clearBackground() { this.background = null; }
    addElementToDraw(img, x, y, depth, originalY, highlight, fe) {
      const e = { img, x, y, depth, originalY, fe };
      let i = 0;
      for (; i < this.elementsToDraw.length; i++) if (depth <= this.elementsToDraw[i].depth) break;
      this.elementsToDraw.splice(i, 0, e);
    }
    addPlayerToDraw(img, x, y, depth, originalY) {
      const e = { img, x, y, depth, originalY, fe: null };
      let i = 0;
      for (; i < this.elementsToDraw.length; i++) if (depth <= this.elementsToDraw[i].originalY) break;
      e.depth = i < this.elementsToDraw.length ? i : this.elementsToDraw.length - 1;
      this.elementsToDraw.splice(i, 0, e);
    }
    addTextToDraw(s, x, y, front, border, bkg, bubbleBorder, arrow) {
      if (s === '') return;
      const t = new Text(this, s, x, y, front, border, bkg, bubbleBorder, arrow);
      let i = 0;
      for (; i < this.textToDraw.length; i++) if (y <= this.textToDraw[i].y) break;
      this.textToDraw.splice(i, 0, t);
    }
    getElementsToInteract() { return this.elementsToInteract; }
    // ------------------------------------------------ scene drawing (with optional transition)
    setTransition(time, type) { if (time > 0 && type > 0) this.transition = { time, type, elapsed: 0, started: false, image: null }; }
    hasTransition() { return this.transition != null && !(this.transition.started && this.transition.elapsed > this.transition.time); }
    snapshot() {
      const c = document.createElement('canvas');
      c.width = this.canvas.width; c.height = this.canvas.height;
      c.getContext('2d').drawImage(this.canvas, 0, 0);
      return c;
    }
    drawScene(l, draw) {
      const t = this.transition;
      if (t && !t.started) {
        this.drawToGraphics();
        t.image = this.snapshot(); t.started = true; t.elapsed = 0;
        return;
      }
      if (t) t.elapsed += l;
      if (!t || (t.started && t.elapsed > t.time)) { this.transition = null; if (draw !== false) this.drawToGraphics(); return; }
      // transition in progress: render the new scene then composite
      this.drawToGraphics();
      const now = this.snapshot(), g = this.g, f = t.elapsed / t.time;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      const W = this.canvas.width, H = this.canvas.height;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (t.type === 4) { g.drawImage(t.image, trunc(-W * f), 0); g.drawImage(now, trunc(W - W * f), 0); }
      else if (t.type === 3) { g.drawImage(t.image, trunc(W * f), 0); g.drawImage(now, trunc(W * f - W), 0); }
      else if (t.type === 1) { g.drawImage(t.image, 0, trunc(H * f)); g.drawImage(now, 0, trunc(H * f - H)); }
      else if (t.type === 2) { g.drawImage(t.image, 0, trunc(-H * f)); g.drawImage(now, 0, trunc(H - H * f)); }
      else { g.drawImage(now, 0, 0); g.globalAlpha = Math.max(0, 1 - f); g.drawImage(t.image, 0, 0); }
      g.restore();
    }
    drawToGraphics() {
      const g = this.g;
      if (this.background) g.drawImage(this.background.img.src, -this.background.off, 0);
      for (const e of this.elementsToDraw) g.drawImage(e.img.src, e.x, e.y);
      this.elementsToInteract = [];
      for (const e of this.elementsToDraw) if (e.fe) this.elementsToInteract.push(e.fe);
      this.elementsToDraw = [];
      if (this.foreground) { g.drawImage(this.foreground.img.src, -this.foreground.off, 0); this.foreground = null; }
      if (this.game.timerManager) this.game.timerManager.draw(this);
      for (const t of this.textToDraw) t.draw(this);
      this.textToDraw = [];
    }
    drawHUD(l) { if (this.hud) this.hud.draw(l); }
    // ------------------------------------------------ text helpers (GUI.drawStringOnto)
    borderText(f, s, x, y, color, border) {
      const g = this.g;
      for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) f.draw(g, s, x + dx, y + dy, border);
      f.draw(g, s, x, y, color);
    }
    drawStringOnto(f, s, n, n2, centered, color, border, withBorder, bubble) {
      const d = f.stringWidth(s, true), d2 = f.ascent;
      let n4 = n, n5 = n2;
      if (centered) {
        if (n4 + d / 2 > 800) n4 = trunc(800 - d / 2); else if (n4 - d / 2 < 0) n4 = trunc(d / 2);
        n4 = trunc(n4 - d / 2);
      } else if (n4 + d > 800) {
        n4 = 0;
        let n3 = trunc(800 / f.stringWidth('A', true)) + 18;
        if (n3 > s.length) n3 = s.length;
        s = s.substring(0, n3) + '...';
      }
      if (n5 > 600) n5 = 600; else if (n5 - d2 < 0) n5 = d2;
      if (bubble) {
        const pl = this.game.functionalPlayer.player, g = this.g;
        g.save(); g.globalAlpha = 0.8;
        roundRect(g, n4 - 4, n5 - d2 + 2, d + 8, d2 + f.descent - 2, 4);
        g.fillStyle = pl.bubbleBkg; g.fill();
        g.translate(0.5, 0.5); roundRect(g, n4 - 4, n5 - d2 + 2, d + 8, d2 + f.descent - 2, 4);
        g.strokeStyle = pl.bubbleBorder; g.lineWidth = 1; g.stroke();
        g.restore();
      }
      if (withBorder) this.borderText(f, s, n4, n5, color, border);
      else f.draw(this.g, s, n4, n5, color);
    }
    // drawStringOnto(Graphics2D, String[], x, y, Color, Color)
    drawStringLines(lines, n, n2, color, border, f) {
      f = f || this.font;
      const n3 = f.height * lines.length - f.leading;
      let n4 = n2 - n3 + f.ascent;
      if (n4 < f.ascent) n4 = f.ascent;
      for (const s of lines) { this.drawStringOnto(f, s, n, n4, true, color, border, true, false); n4 += f.height; }
    }
    drawCenteredString(f, s, n, n2, color) {
      const d = f.stringWidth(s, true), d2 = f.ascent;
      let n3 = n, n4 = n2;
      if (n3 + d / 2 > 800) n3 = trunc(800 - d / 2); else if (n3 - d / 2 < 0) n3 = trunc(d / 2);
      n3 = trunc(n3 - d / 2);
      if (n4 + d2 / 2 > 600) n4 = trunc(600 - d2 / 2); else if (n4 < 0) n4 = 0;
      n4 = trunc(n4 + d2 / 2);
      f.draw(this.g, s, n3, n4, color);
    }
    // ------------------------------------------------ cursors
    setCursor(key) {
      if (key === this.cursorKey) return;
      this.cursorKey = key;
      this.canvas.style.cursor = this.cursors.get(key) || 'default';
    }
    setDefaultCursor() { this.setCursor('default'); }
    // ------------------------------------------------ input forwarding
    toggleHud(b) { if (this.hud) this.hud.toggleHud(b); }
    update(l) { if (this.hud) this.hud.update(l); }
  }
  // java Graphics.fillRoundRect / drawRoundRect (arcWidth = arcHeight = 2r)
  function roundRect(g, x, y, w, h, arc) {
    const r = arc / 2;
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  // ===================================================================== action manager
  class ActionManager {
    constructor(game) { this.game = game; this.elementOver = null; this.actionSelected = 6; this.customActionName = null; this.exit = ''; this.exitCursor = null; this.targets = null; }
    getElementOver() { return this.elementOver; }
    setElementOver(e) { this.elementOver = e; }
    getActionSelected() { return this.actionSelected; }
    setActionSelected(n) { this.actionSelected = n; }
    getExit() { return this.exit; }
    setExit(s) { this.exit = s == null ? '' : s; }
    deleteCustomExit() { this.setExit(null); this.exitCursor = null; }
    getCustomActionName() { return this.customActionName; }
    setCustomActionName(s) { this.customActionName = s; }
    mouseClicked(e) { this.game.functionalScene.mouseClicked(e.x, e.y); }
    isElementTarget(fe) {
      if (!this.targets) {
        this.targets = new Set();
        const ch = this.game.chapter;
        const add = (acts) => { for (const a of acts) if (a.target) this.targets.add(a.target); };
        for (const it of ch.items.values()) add(it.actions);
        for (const c of ch.characters.values()) add(c.actions);
        for (const s of ch.scenes.values()) for (const a of s.activeAreas) add(a.actions);
      }
      const el = fe && fe.getElement();
      return !!(el && el.id != null && this.targets.has(el.id));
    }
    mouseMoved(e) {
      const g = this.game, fs = g.functionalScene;
      if (!fs) return;
      const exit = fs.getExitInside(e.x, e.y);
      const fe = fs.getElementInside(e.x, e.y, null);
      if (exit == null && fe != null) {
        const el = fe.getElement();
        const d0 = el.descriptions[0];
        if (el.actions && el.actions.length !== 0 || this.isElementTarget(fe) || el.descriptions.length > 1 || (d0 && d0.detailed != null && d0.detailed !== '')) this.setElementOver(fe);
      } else if (exit != null && this.actionSelected === 6) {
        this.exitCursor = exit.look && exit.look.cursor ? exit.look.cursor : null;
        let next = null;
        const gs = g.chapter.general.get(exit.nextSceneId);
        if (gs) next = gs;
        const t = exit.look ? exit.look.text : null;
        if (t != null && t !== '') this.setExit(t);
        else if (t != null) this.setExit(' ');
        else if (next) this.setExit(next.name);
      }
    }
  }

  // ===================================================================== contextual HUD
  class ActionButton {
    constructor(hud, type, custom) {
      this.hud = hud; this.over = false; this.posX = 0; this.posY = 0;
      if (custom) {
        this.actionName = custom.name; this.customAction = custom;
        const res = E1.resourcesBlock(hud.game, custom.resources, null);
        const a = hud.game.assets;
        this.normal = a.image(res.assets.get('buttonNormal')) || a.image('gui/hud/contextual/btnError.png');
        this.overImg = a.image(res.assets.get('buttonOver')) || a.image('gui/hud/contextual/btnError.png');
        this.w = this.normal.width; this.h = this.normal.height; this.type = 4;
      } else this.reload(type);
    }
    reload(n) {
      const g = this.hud.game, S = g.strings;
      const map = { 0: ['use', 'btnUse', 'ActionButton.Use'], 6: ['use-with', 'btnUseWith', 'ActionButton.UseWith'], 5: ['grab', 'btnGrab', 'ActionButton.Grab'],
        7: ['give-to', 'btnGiveTo', 'ActionButton.GiveTo'], 8: ['use-grab', 'btnGiveTo', 'ActionButton.UseGive'], 1: ['examine', 'btnExamine', 'ActionButton.Examine'],
        2: ['talk', 'btnTalkTo', 'ActionButton.Talk'], 3: ['drag-to', 'btnDragTo', 'ActionButton.Drag'] }[n];
      const d = g.descriptor, a = g.assets;
      const pn = d.buttons.get(map[0] + '#normal'), ph = d.buttons.get(map[0] + '#highlighted');
      this.normal = (pn ? a.image(pn) : a.image('gui/hud/contextual/' + map[1] + '.png')) || a.image('gui/hud/contextual/btnError.png');
      this.overImg = (ph ? a.image(ph) : a.image('gui/hud/contextual/' + map[1] + 'Highlighted.png')) || a.image('gui/hud/contextual/btnError.png');
      this.w = this.normal.width; this.h = this.normal.height;
      this.actionName = S.get(map[2]) || '';
      this.type = n;
    }
    draw(g, f, n, n2) {
      if (this.over) g.drawImage(this.overImg.src, this.posX - idiv(this.w, 2), this.posY - idiv(this.h, 2));
      else { g.save(); g.globalAlpha = f; g.drawImage(this.normal.src, n - idiv(this.w, 2), n2 - idiv(this.h, 2)); g.restore(); }
    }
    drawName(gui) { gui.drawStringLines([this.actionName], this.posX, this.posY - idiv(this.h, 2), '#000000', '#ffffff'); }
    isInside(n, n2) {
      return n > this.posX - idiv(this.w, 2) && n < this.posX + idiv(this.w, 2) && n2 > this.posY - idiv(this.h, 2) && n2 < this.posY + idiv(this.h, 2);
    }
  }
  class ActionButtons {
    constructor(hud) {
      this.hud = hud; this.buttons = []; this.radius = 50; this.centerX = 0; this.centerY = 0; this.buttonOver = null; this.buttonPressed = null;
      this.hand = new ActionButton(hud, 0); this.mouth = new ActionButton(hud, 2); this.eye = new ActionButton(hud, 1);
      this.appeared = Infinity;
    }
    // how many buttons recreate() would show for fe (for touch taps)
    countFor(fe) {
      const keep = this.buttons; this.buttons = [];
      try {
        if (fe instanceof E1.FunctionalItem) { this.addDefaultObjectButtons(fe); this.addCustom(fe.item.actions, fe); }
        if (fe instanceof E1.FunctionalNPC) { this.addDefaultCharacterButtons(fe); this.addCustom(fe.npc.actions, fe); }
        return this.buttons.length;
      } finally { this.buttons = keep; }
    }
    recreate(x, y, fe) {
      this.centerX = x; this.centerY = y; this.buttons = [];
      if (fe instanceof E1.FunctionalItem) { this.addDefaultObjectButtons(fe); this.addCustom(fe.item.actions, fe); }
      if (fe instanceof E1.FunctionalNPC) { this.addDefaultCharacterButtons(fe); this.addCustom(fe.npc.actions, fe); }
      this.recalculate();
      this.clearButtons();
      this.appeared = performance.now();
    }
    addCustom(list, fe) {
      const seen = [];
      let drag = false;
      for (const a of list) {
        if (this.buttons.length >= 8) return;
        if (a.type === 8 && !drag && !fe.isInInventory()) {
          if (fe.getFirstValidAction(8) != null) { this.buttons.push(new ActionButton(this.hud, 3)); drag = true; }
        }
        if (a.type === 5 || a.type === 6) {
          let ok = a.type === 5 ? fe.getFirstValidCustomAction(a.name) != null : fe.getFirstValidCustomInteraction(a.name) != null;
          for (const c of seen) if (c.name === a.name) ok = false;
          if (!ok) continue;
          this.buttons.push(new ActionButton(this.hud, 4, a));
          seen.push(a);
        }
      }
    }
    clearButtons() { for (const b of this.buttons) b.over = false; this.buttonOver = null; this.buttonPressed = null; }
    recalculate() {
      let d = Math.PI / (this.buttons.length - 1), d2 = Math.PI;
      let n = this.centerY, n2 = this.centerX;
      this.radius = 20 * this.buttons.length;
      if (this.centerY > 300) { if (this.centerY > 575) n = 575; d = -d; } else if (this.centerY < 25) n = 25;
      if (this.centerX > 775) n2 = 775;
      if (this.centerX < 50) n2 = 50;
      if (n2 < this.radius + 25) {
        if (n - this.radius < 50) { d2 /= 2; d /= 2; this.radius *= 1.5; }
        else if (n + this.radius > 575) { d2 += d2 / 2; d /= 2; this.radius *= 1.5; }
        else { if (this.centerY > 300) d = -d; d2 /= 2; }
      } else if (n2 > 800 - this.radius - 25) {
        if (n - this.radius < 50) { d2 /= 2; d = -d / 2; this.radius *= 1.5; }
        else if (n + this.radius > 575) { d2 += d2 / 2; d = -d / 2; this.radius *= 1.5; }
        else { if (this.centerY > 300) d = -d; d2 = -d2 / 2; }
      }
      for (const b of this.buttons) {
        b.posX = trunc(Math.cos(d2) * this.radius + n2);
        b.posY = trunc(Math.sin(d2) * this.radius + n);
        d2 -= d;
      }
    }
    addDefaultCharacterButtons(npc) {
      const el = npc.npc, d0 = el.descriptions[0];
      if (npc.getFirstValidAction(0) != null || el.descriptions.length > 1 || (d0 && d0.detailed !== '')) this.buttons.push(this.eye);
      if (npc.getFirstValidAction(7) != null) this.buttons.push(this.mouth);
      if (npc.getFirstValidAction(4) != null) { this.hand.reload(0); this.buttons.push(this.hand); }
    }
    addDefaultObjectButtons(fi) {
      const el = fi.getElement(), d0 = el.descriptions[0];
      if (fi.getFirstValidAction(0) != null || el.descriptions.length > 1 || (d0 && d0.detailed !== '')) this.buttons.push(this.eye);
      let bl = false;
      if (!fi.isInInventory()) {
        this.hand.reload(5);
        const a = fi.getFirstValidAction(1), a2 = fi.getFirstValidAction(4);
        if (a != null) bl = true;
        if (a2 != null) { if (a2.conditionsAreMeet || (a != null && !a.conditionsAreMeet)) this.hand.reload(0); bl = true; }
      } else {
        const b2 = fi.canBeUsedAlone(), b3 = fi.getFirstValidAction(2) != null, b4 = fi.getFirstValidAction(3) != null;
        bl = b2 || b3 || b4;
        if (b2 && !b3 && !b4) this.hand.reload(0);
        else if (!b2 && b3 && !b4) this.hand.reload(7);
        else if (!b2 && !b3 && b4) this.hand.reload(6);
        else if (!b2 && b3 && b4) this.hand.reload(8);
        else this.hand.reload(0);
      }
      if (bl) this.buttons.push(this.hand);
    }
    getButton(x, y) { for (const b of this.buttons) if (b.isInside(x, y)) return b; return null; }
    mouseMoved(e) { this.clearButtons(); const b = e && this.getButton(e.x, e.y); if (b) { b.over = true; this.buttonOver = b; } }
    mouseClicked(e) { this.clearButtons(); const b = e && this.getButton(e.x, e.y); if (b) this.buttonPressed = b; }
    draw(gui) {
      if (this.buttons.length === 0) return;
      const g = gui.g;
      let f = (performance.now() - this.appeared) / 600;
      if (f > 1) f = 1;
      g.save(); g.globalAlpha = 0.4; g.fillStyle = '#ff0000';
      g.beginPath(); g.ellipse(this.centerX, this.centerY, 8, 8, 0, 0, Math.PI * 2); g.fill(); g.restore();
      for (const b of this.buttons) {
        const n = trunc((b.posX - this.centerX) * f + this.centerX), n2 = trunc((b.posY - this.centerY) * f + this.centerY);
        g.save(); g.globalAlpha = 0.4; g.strokeStyle = '#ff0000';
        g.beginPath();
        if (b.over) { g.lineWidth = 3; g.moveTo(this.centerX, this.centerY); g.lineTo(b.posX, b.posY); }
        else { g.lineWidth = 1; g.moveTo(this.centerX + 0.5, this.centerY + 0.5); g.lineTo(n + 0.5, n2 + 0.5); }
        g.stroke(); g.restore();
        b.draw(g, f, n, n2);
      }
      if (this.buttonOver) this.buttonOver.drawName(gui);
    }
  }

  class InventoryPanel {
    constructor(hud) {
      this.hud = hud; this.first = 0; this.dy = 33; this.dx = 0; this.upper = false; this.drawLeft = false; this.drawRight = false;
      this.hiLeft = false; this.hiRight = false;
      const a = hud.game.assets, d = hud.game.descriptor;
      this.left = a.image(d.arrows.get('normalleft') || 'gui/hud/contextual/left.png');
      this.right = a.image(d.arrows.get('normalright') || 'gui/hud/contextual/right.png');
      this.lefthigh = a.image(d.arrows.get('highlightedleft') || 'gui/hud/contextual/left.png');
      this.righthigh = a.image(d.arrows.get('highlightedright') || 'gui/hud/contextual/right.png');
      this.buf = document.createElement('canvas');
    }
    inv() { return this.hud.game.inventory; }
    draw(gui) {
      if (this.dy === 33 || this.dy === 48) return;
      const k = gui.dpr;
      const c = this.buf;
      if (c.width !== Math.round(800 * k)) { c.width = Math.round(800 * k); c.height = Math.round(48 * k); }
      const g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, 0, 0);
      g.clearRect(0, 0, 800, 48);
      g.globalAlpha = 0.3; g.fillStyle = '#404040'; g.fillRect(0, 0, 800, 48); g.globalAlpha = 1;
      this.drawLeft = false; this.drawRight = false;
      const inv = this.inv(), cnt = inv.getItemCount();
      let n;
      if (cnt < 8) { this.first = 0; n = cnt - 1; }
      else {
        if (this.first > 0) this.drawLeft = true;
        if (cnt - this.first > 8) { this.drawRight = true; n = this.first + 8; } else n = cnt - 1;
      }
      let n3 = 80 + trunc(this.dx);
      g.save(); g.beginPath(); g.rect(80, 0, 640, 48); g.clip();
      let n4 = this.first - 1;
      if (n4 < 0) n4 = 0; else n3 -= 80;
      let n5 = n + 1; if (n5 > cnt) n5 = cnt;
      for (let i = n4; i < n5; i++) { const ic = inv.getItem(i).getIconImage(); if (ic) g.drawImage(ic.src, n3, 0); n3 += 80; }
      g.restore();
      if (this.drawLeft) g.drawImage((this.hiLeft ? this.lefthigh : this.left).src, 0, 0);
      if (this.drawRight) g.drawImage((this.hiRight ? this.righthigh : this.right).src, 720, 0);
      gui.g.drawImage(c, 0, trunc(this.upper ? -this.dy : 552 + this.dy), 800, 48);
    }
    mouseClicked(e) {
      let found = null;
      const n = !this.upper ? 552 : 0, inv = this.inv();
      if (e.y <= n || e.y >= n + 48) return null;
      if (e.x > 80 && e.x < 720) {
        const n3 = Math.min(this.first + 8, inv.getItemCount());
        let n4 = 80;
        for (let i = this.first; i < n3; i++) { if (n4 < e.x && e.x < n4 + 80) found = inv.getItem(i); n4 += 80; }
      } else if (e.x > 0 && e.x < 80) { if (this.dx === 0 && this.first > 0) this.dx = 1; }
      else if (e.x > 720 && e.x < 800) { if (this.dx === 0 && inv.getItemCount() > this.first + 8) this.dx = -1; }
      return found;
    }
    mouseMoved(e) {
      let found = null;
      const n = !this.upper ? 552 : 0, inv = this.inv();
      this.hiLeft = false; this.hiRight = false;
      if (e.y <= n || e.y >= n + 48) return;
      if (e.x > 80 && e.x < 720) {
        const n2 = Math.min(this.first + 8, inv.getItemCount());
        let n3 = 80;
        for (let i = this.first; i < n2; i++) { if (n3 < e.x && e.x < n3 + 80) found = inv.getItem(i); n3 += 80; }
      } else if (e.x > 0 && e.x < 80) this.hiLeft = true;
      else if (e.x > 720 && e.x < 800) this.hiRight = true;
      this.hud.game.actionManager.setElementOver(found);
    }
    setDY(d) { this.dy = Math.max(0, Math.min(48, d)); }
    setDX(d) {
      if (d < -80) { this.first++; d = 0; }
      if (d > 80) { this.first--; d = 0; }
      this.dx = d;
    }
    update(l) { if (this.dx > 0) this.setDX(this.dx + l / 5); if (this.dx < 0) this.setDX(this.dx - l / 5); }
  }

  class ContextualHUD {
    constructor(game) {
      this.game = game; this.gui = game.gui; this.showHud = true;
      this.actionButtons = new ActionButtons(this); this.inventory = new InventoryPanel(this);
      this.showInventory = false; this.showActionButtons = false; this.elementAction = null; this.elementInCursor = null;
      this.lastMouseMoved = null; this.pressedTime = Infinity; this.pressedX = 0; this.pressedY = 0; this.pressedElement = null;
      this.mouseReleasedFlag = false; this.pressed = false; this.lastSelectedAction = -1;
    }
    toggleHud(b) { this.showHud = b; this.elementInCursor = null; }
    setLastMouseMove(e) { this.lastMouseMoved = e; }
    keyTyped(e) {
      if (e.keyCode === 27) {
        const am = this.game.actionManager;
        if (!this.showActionButtons && am.getElementOver() == null && this.elementInCursor != null) {
          this.elementInCursor = null; this.gui.setDefaultCursor(); this.elementAction = null; this.showActionButtons = false;
          return true;
        }
      }
      return false;
    }
    mouseMoved(e) {
      let bl = false;
      if (!this.pressed) bl = this.moved(e);
      if (this.pressed) bl = this.dragged(e);
      this.lastMouseMoved = e;
      return bl;
    }
    moved(e) {
      let bl = false;
      this.actionButtons.mouseMoved(null);
      if (this.showActionButtons) { this.actionButtons.mouseMoved(e); bl = this.actionButtons.buttonOver != null; }
      else if (this.showInventory) bl = this.processInventoryMove(e, bl);
      else if (e.y > 564 && this.game.showBottomInventory()) { this.inventory.upper = false; this.showInventory = true; }
      else if (e.y < 36 && this.game.showTopInventory()) { this.inventory.upper = true; this.showInventory = true; }
      return bl;
    }
    processInventoryMove(e, bl) {
      if (this.inventory.upper) {
        if (e.y < 48) { this.inventory.mouseMoved(e); return true; }
        if (e.y > 60) this.showInventory = false;
      } else {
        if (e.y > 552) { this.inventory.mouseMoved(e); return true; }
        if (e.y < 540) this.showInventory = false;
      }
      return bl;
    }
    dragged(e) {
      const now = performance.now();
      if (now - this.pressedTime >= 0 && now - this.pressedTime <= 60000 && Math.abs(this.pressedX - e.x) < 10 && Math.abs(this.pressedY - e.y) < 10) return true;
      this.gui.setDefaultCursor();
      // dragElement (no draggable elements in this game)
      const fs = this.game.functionalScene;
      if (fs) this.game.actionManager.setElementOver(fs.getElementInside(e.x, e.y, null));
      this.pressedTime = Infinity;
      return true;
    }
    mouseClicked(e) {
      let bl = false;
      if (this.mouseReleasedFlag) { this.mouseReleasedFlag = false; return true; }
      this.pressedTime = Infinity;
      const am = this.game.actionManager;
      if (!this.game.isShowActions() && e.button !== 1 && e.button !== 3) return false;
      let bl2 = false;
      if (this.showActionButtons) { this.actionButtons.mouseClicked(e); if (this.actionButtons.buttonPressed != null) bl2 = true; }
      const fs = this.game.functionalScene;
      let fe = fs.getElementInside(e.x, e.y, null);
      if (this.showInventory && fe == null) { this.inventory.mouseMoved(e); fe = am.getElementOver(); }
      const pe = this.pressedElement;
      const firstAction = pe instanceof E1.FunctionalItem && pe.item.behaviour === 2;
      // Touch screens have no right button: a tap on an object opens its action
      // buttons, as a right click does on a PC (a long press does it too).
      if (e.touch && e.button === 1 && e.clickCount !== 2 && !bl2 && this.elementInCursor == null &&
          pe != null && !firstAction && this.actionButtons.countFor(pe) > 0) e = Object.assign({}, e, { button: 3 });
      if (!firstAction && ((!bl2 && (e.button === 3 || this.game.isShowActions()) && this.elementInCursor == null) || e.clickCount === 2 || (!bl2 && fe == null && this.elementInCursor != null))) {
        bl = this.processRightClickNoButton(pe, e);
      } else if (this.showActionButtons) {
        this.actionButtons.mouseClicked(e);
        if (this.actionButtons.buttonPressed != null) { bl = this.processButtonPressed(am); this.showActionButtons = false; this.elementAction = null; }
      } else if (this.showInventory && (e.y > 552 || e.y < 48)) {
        bl = this.processInventoryClick(am, e); this.showActionButtons = false; this.elementAction = null;
      } else if (pe != null) {
        bl = this.processElementClick(am); this.showActionButtons = false; this.elementAction = null;
      }
      if (!bl) { this.showActionButtons = false; this.elementAction = null; }
      return bl;
    }
    mousePressed(e) {
      this.pressed = true;
      this.pressedTime = performance.now();
      this.pressedX = e.x; this.pressedY = e.y;
      this.pressedElement = this.game.actionManager.getElementOver();
      return true;
    }
    mouseReleased(e) {
      this.pressed = false;
      this.mouseReleasedFlag = true;
      if (this.pressedElement == null) { this.mouseReleasedFlag = false; return true; }
      this.pressedTime = performance.now() - this.pressedTime;
      if (this.pressedTime >= 800 && this.pressedTime < 60000) {
        if (Math.abs(this.pressedX - e.x) < 20 && Math.abs(this.pressedY - e.y) < 20) {
          this.processRightClickNoButton(this.pressedElement, e);
          this.pressedTime = Infinity;
          return true;
        }
      } else if (this.pressedTime >= 0 && this.pressedTime < 600 && Math.abs(this.pressedX - e.x) < 30 && Math.abs(this.pressedY - e.y) < 30) {
        this.mouseReleasedFlag = false;
        this.pressedTime = Infinity;
        if (this.pressedX !== e.x && this.pressedY !== e.y) {
          return this.mouseClicked({ x: this.pressedX, y: this.pressedY, button: 1, clickCount: 1 });
        }
        return true;
      }
      this.pressedTime = Infinity;
      return false;
    }
    processElementClick(am) {
      if (this.elementInCursor != null) {
        this.elementInCursor = null;
        this.gui.setDefaultCursor();
      } else this.processElementFirstAction(am);
      return true;
    }
    processElementFirstAction(am) {
      const pe = this.pressedElement, fp = this.game.functionalPlayer;
      if (pe == null) return; // (the original would throw here; reachable with touch input)
      if (pe instanceof E1.FunctionalItem) {
        const it = pe.item;
        if (it.behaviour === 0) { am.setActionSelected(0); fp.performActionInElement(pe); }
        else if (it.behaviour === 2 && it.actions.length > 0) {
          let action = null;
          for (const a of it.actions) if (E1.condOk(this.game, a.conditions)) { action = a; break; }
          if (!action) return;
          if (action.type === 4 && pe.canBeUsedAlone()) { am.setActionSelected(4); fp.performActionInElement(pe); }
          else if (action.type === 1 && !pe.isInInventory()) { am.setActionSelected(1); fp.performActionInElement(pe); }
          else if (action.type === 0) { am.setActionSelected(3); fp.performActionInElement(pe); }
          else if (action.type === 7) { am.setActionSelected(2); fp.performActionInElement(pe); this.lastSelectedAction = 2; }
          else if (action.type === 5) {
            am.setActionSelected(9); am.setCustomActionName(it.actions[0].name); fp.performActionInElement(pe);
          }
        }
      } else { am.setActionSelected(0); fp.performActionInElement(pe); }
    }
    processInventoryClick(am, e) {
      const fe = this.inventory.mouseClicked(e);
      if (this.elementInCursor != null) {
        if (fe != null) { this.elementInCursor = null; this.gui.setDefaultCursor(); }
      } else if (fe != null) this.processElementFirstAction(am);
      return true;
    }
    processButtonPressed(am) {
      this.lastSelectedAction = -1;
      const b = this.actionButtons.buttonPressed, fp = this.game.functionalPlayer;
      switch (b.type) {
        case 0: case 5: case 6: case 7: case 8:
          this.elementInCursor = null; this.gui.setDefaultCursor();
          if (b.type === 0) { am.setActionSelected(4); fp.performActionInElement(this.elementAction); break; }
          if (b.type === 5 && !this.elementAction.isInInventory()) { am.setActionSelected(1); fp.performActionInElement(this.elementAction); break; }
          break;
        case 1: am.setActionSelected(3); fp.performActionInElement(this.elementAction); break;
        case 2: am.setActionSelected(2); fp.performActionInElement(this.elementAction); this.lastSelectedAction = 2; break;
        case 4:
          if (b.customAction.type === 5) { am.setActionSelected(9); am.setCustomActionName(b.actionName); fp.performActionInElement(this.elementAction); }
          break;
        default: break;
      }
      am.setActionSelected(6);
      return true;
    }
    processRightClickNoButton(fe, e) {
      this.elementInCursor = null;
      this.gui.setDefaultCursor();
      const firstAction = fe != null && fe.getElement() && fe instanceof E1.FunctionalItem && !(fe instanceof E1.FunctionalActiveArea) && fe.item.behaviour === 2;
      if (fe != null && !firstAction) {
        this.elementAction = fe;
        this.actionButtons.recreate(e.x, e.y, fe);
        this.showActionButtons = true;
        return true;
      }
      this.elementAction = null; this.showActionButtons = false;
      return false;
    }
    draw() {
      const am = this.game.actionManager, gui = this.gui, g = gui.g;
      this.inventory.draw(gui);
      if (this.showActionButtons) this.actionButtons.draw(gui);
      const now = performance.now();
      let indicator = false;
      if (now - this.pressedTime > 100) {
        const l = now - this.pressedTime;
        g.save(); g.fillStyle = '#0000ff';
        if (l < 800) {
          g.globalAlpha = 0.4;
          const n = 6 + trunc(8 * l / 800);
          const ext = trunc(0.45 * l);
          g.beginPath(); g.moveTo(this.pressedX, this.pressedY);
          g.arc(this.pressedX, this.pressedY, n, 0, ext * Math.PI / 180, false);
          g.closePath(); g.fill();
        } else {
          g.globalAlpha = Math.max(0, Math.min(1, 0.4 + 0.5 * Math.pow(1 - (l % 600) / 300, 2)));
          g.beginPath(); g.ellipse(this.pressedX, this.pressedY, 16, 16, 0, 0, Math.PI * 2); g.fill();
        }
        g.restore();
        indicator = true; // the original leaves AlphaComposite.DstAtop set: later text is invisible
      }
      const lm = indicator ? null : this.lastMouseMoved;
      if (this.elementInCursor == null) {
        if (am.getExit() !== '') {
          gui.setCursor(am.exitCursor ? 'exit:' + am.exitCursor : 'exit');
          if (lm) gui.drawStringLines([am.getExit()], lm.x + 16, lm.y, '#ffffff', '#000000', gui.hudFont);
        } else if (am.getElementOver() != null) {
          gui.setCursor('over');
          if (lm) {
            const d = E1.description(this.game, am.getElementOver().getElement().descriptions);
            gui.drawStringLines([E1.processText(this.game, d.name)], lm.x + 16, lm.y, '#ffffff', '#000000', gui.hudFont);
          }
        } else if (this.showActionButtons && this.actionButtons.buttonOver != null) gui.setCursor('action');
        else {
          gui.setDefaultCursor();
          const fs = this.game.functionalScene;
          if (fs) fs.resetAllItems(null);
        }
      }
    }
    update(l) {
      const g = this.game;
      if (g.isInventoryFixed()) { this.showInventory = true; this.inventory.upper = !g.showBottomInventory() && g.showTopInventory(); }
      this.inventory.update(l);
      if (this.showHud && this.showInventory) this.inventory.setDY(this.inventory.dy - l / 10);
      else this.inventory.setDY(this.inventory.dy + l / 10);
    }
  }

  Object.assign(E1, { GUI, ContextualHUD, ActionManager, roundRect });
})(typeof window !== 'undefined' ? window : globalThis);

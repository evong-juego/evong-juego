/* EVONG web: Game (state machine, effect queue), game states, options menu, main loop and input. */
(function (global) {
  'use strict';
  const E1 = global.E1;
  const MIN_INT = E1.MIN_INT;
  const trunc = Math.trunc;
  const idiv = (a, b) => trunc(a / b);

  class Options {
    constructor() {
      this.p = { Music: 'On', FunctionalEffects: 'On', TextSpeed: '1' };
      try { const s = JSON.parse(localStorage.getItem('evong-options') || 'null'); if (s) Object.assign(this.p, s); } catch (e) { /* no storage */ }
    }
    save() { try { localStorage.setItem('evong-options', JSON.stringify(this.p)); } catch (e) { /* no storage */ } }
    isMusicActive() { return this.p.Music === 'On'; }
    setMusicActive(b) { this.p.Music = b ? 'On' : 'Off'; }
    isEffectsActive() { return this.p.FunctionalEffects === 'On'; }
    setEffectsActive(b) { this.p.FunctionalEffects = b ? 'On' : 'Off'; }
    getTextSpeed() { return parseInt(this.p.TextSpeed, 10) || 0; }
    setTextSpeed(n) { this.p.TextSpeed = String(n); }
    textSpeedFactor() { const t = this.getTextSpeed(); return t === 0 ? 1.5 : t === 2 ? 0.8 : 1; }
  }

  // ===================================================================== states
  class GameState {
    constructor(game) { this.game = game; }
    mouseClicked() {} mousePressed() {} mouseReleased() {} mouseDragged() {} mouseMoved() {} keyPressed() {}
  }
  class StateLoading extends GameState {
    mainLoop() {
      const gui = this.game.gui;
      gui.begin();
      gui.drawCenteredString(gui.font, 'Please wait', 400, 280, '#ffffff');
      gui.drawCenteredString(gui.font, 'Loading ...', 400, 300, '#ffffff');
    }
  }

  class StatePlaying extends GameState {
    constructor(game) { super(game); this.q = []; }
    mouseClicked(e) { this.q.push(['c', e]); }
    mouseMoved(e) { this.q.push(['m', e]); }
    mousePressed(e) { this.q.push(['p', e]); }
    mouseReleased(e) { this.q.push(['r', e]); }
    mouseDragged(e) { this.q.push(['m', e]); }
    mainLoop(l) {
      const g = this.game, gui = g.gui;
      while (this.q.length) {
        const [k, e] = this.q.shift();
        if (k === 'c') { if (!gui.hud.mouseClicked(e)) g.actionManager.mouseClicked(e); }
        else if (k === 'm') {
          g.actionManager.deleteCustomExit();
          g.actionManager.setElementOver(null);
          if (!gui.hud.mouseMoved(e)) g.actionManager.mouseMoved(e);
        } else if (k === 'p') gui.hud.mousePressed(e);
        else if (k === 'r') gui.hud.mouseReleased(e);
        if (g.currentState !== this) break;
      }
      g.functionalScene.update(l);
      gui.update(l);
      gui.begin();
      g.functionalScene.draw();
      gui.drawScene(l);
      gui.drawHUD(l);
      g.updateDataPendingFromState(true);
    }
    keyPressed(e) {
      if (e.keyCode === 27 && !this.game.gui.hud.keyTyped(e)) this.game.setState(8);
    }
  }

  class StateRunEffects extends GameState {
    constructor(game, fromConversation) { super(game); this.current = null; this.fromConversation = fromConversation; this.button = 0; }
    mainLoop(l) {
      const g = this.game, gui = g.gui;
      g.actionManager.setElementOver(null);
      g.actionManager.deleteCustomExit();
      gui.toggleHud(false);
      gui.setDefaultCursor();
      if (g.functionalScene) g.functionalScene.update(l);
      gui.update(l);
      gui.begin();
      if (g.functionalScene) g.functionalScene.draw();
      gui.drawScene(l);
      gui.drawHUD(l);
      if (this.current == null || !this.current.isStillRunning()) {
        this.current = null;
        let done = false;
        while (!done) {
          const fe = g.getFirstElementOfTop();
          if (fe == null) { gui.toggleHud(true); done = true; g.evaluateState(); continue; }
          if (!fe.isAllConditionsOK()) continue;
          fe.triggerEffect();
          done = !fe.isInstantaneous();
          if (done) this.current = fe;
        }
      } else if (this.current.isStillRunning()) {
        if ((this.button === 1 || this.button === 3) && this.current.canSkip()) this.current.skip();
      }
      this.button = 0;
    }
    mouseClicked(e) { this.button = e.button === 1 ? 1 : e.button === 3 ? 3 : 0; }
    keyPressed() { this.button = 3; }
  }

  class StateNextScene extends GameState {
    mainLoop(l) {
      const g = this.game, gui = g.gui, exit = g.nextScene;
      const gs = g.chapter.general.get(exit.nextSceneId);
      if (!gs) { console.warn('unknown scene', exit.nextSceneId); g.setState(1); return; }
      if (gs.kind === 0) {
        const fs = g.functionalScene;
        if (fs == null || fs.scene.id !== gs.id) {
          gui.setTransition(exit.transitionTime, exit.transitionType);
          if (gui.hasTransition() && fs) { gui.begin(); fs.draw(); gui.drawScene(l); }
          gui.clearBackground();
          g.setState(0);
          let l2 = -1;
          const musicOf = (sc) => { for (const r of sc.resources) if (E1.condOk(g, r.conditions)) return r.assets.get('bgmusic') || null; return null; };
          const s1 = musicOf(gs);
          let s2 = null;
          if (fs) s2 = musicOf(fs.scene); else if (g.musicInSlides != null) s2 = g.musicInSlides;
          if (s2 != null && s1 != null && s2 === s1 && fs) l2 = fs.backgroundMusicId;
          else if (s2 != null && s1 != null && s2 === s1 && g.musicInSlides != null) { l2 = g.musicInSlidesId; g.musicInSlides = null; g.musicInSlidesId = -1; }
          else if (fs) fs.stopBackgroundMusic();
          const nfs = new E1.FunctionalScene(g, gs, g.functionalPlayer, l2);
          g.functionalScene = nfs;
          const p = g.functionalPlayer;
          if (exit.destinyX !== MIN_INT && exit.destinyY !== MIN_INT) { p.setX(exit.destinyX); p.setY(exit.destinyY); }
          else if (gs.posX !== MIN_INT && gs.posY !== MIN_INT) { p.setX(gs.posX); p.setY(gs.posY); }
          else { p.setX(400); p.setY(300); }
          p.cancelActions(); p.cancelAnimations();
          g.actionManager.setActionSelected(6);
        }
        g.storeAllEffects(exit.postEffects);
      } else {
        gui.setTransition(exit.transitionTime, exit.transitionType);
        if (gui.hasTransition() && g.functionalScene) { gui.begin(); g.functionalScene.draw(); gui.drawScene(l); }
        gui.clearBackground();
        if (g.functionalScene) g.functionalScene.restartElementReferencesPositions();
        g.setState(2);
      }
    }
  }

  class StateSlidescene extends GameState {
    constructor(game) {
      super(game);
      const g = game;
      this.ss = g.chapter.general.get(g.nextScene.nextSceneId);
      this.finish = false; this.yetSkipped = false; this.musicPath = null; this.keyDown = false;
      const res = E1.resourcesBlock(g, this.ss.resources, { assets: new Map([['slides', 'gui/defaultassets/NRB_slides']]) });
      this.bgId = -1;
      const fs = g.functionalScene;
      if (fs) {
        let a = null, b = null;
        for (const r of fs.scene.resources) if (E1.condOk(g, r.conditions)) { a = r.assets.get('bgmusic') || null; break; }
        for (const r of this.ss.resources) if (E1.condOk(g, r.conditions)) { b = r.assets.get('bgmusic') || null; break; }
        if (a != null && b != null && a === b) this.bgId = fs.backgroundMusicId; else fs.stopBackgroundMusic();
      }
      if (g.options.isMusicActive()) {
        if (this.bgId !== -1) {
          if (!g.mm.isPlaying(this.bgId)) { this.musicPath = res.assets.get('bgmusic'); this.bgId = g.mm.loadMusic(this.musicPath, true); g.mm.startPlaying(this.bgId); }
        } else if (res.assets.has('bgmusic')) {
          this.musicPath = res.assets.get('bgmusic'); this.bgId = g.mm.loadMusic(this.musicPath, true); g.mm.startPlaying(this.bgId);
        }
      }
      this.slides = g.anims.slides(res.assets.get('slides'));
      this.slides.start();
    }
    mainLoop(l) {
      const g = this.game, gui = g.gui;
      this.slides.update(l);
      if (!this.slides.isPlayingForFirstTime() && !this.finish) this.finishedSlides();
      if (!this.finish) {
        gui.begin();
        gui.addBackgroundToDraw(this.slides.getImage(), 0);
        gui.drawScene(l);
      }
    }
    mouseClicked() { this.nextSlides(); }
    keyPressed() { if (!this.keyDown) { this.keyDown = true; this.nextSlides(); } }
    nextSlides() {
      const bl = this.slides.nextImage();
      this.keyDown = false;
      if (bl) this.finishedSlides();
    }
    finishedSlides() {
      const g = this.game, ss = this.ss;
      this.finish = true;
      if (!this.yetSkipped && ss.next === 1) { this.yetSkipped = true; g.goToNextChapter(); }
      else if (ss.next === 2) {
        const ex = E1.newExit(ss.targetId);
        ex.destinyX = ss.destinyX; ex.destinyY = ss.destinyY; ex.postEffects = ss.effects;
        ex.transitionTime = ss.transitionTime; ex.transitionType = ss.transitionType;
        g.setNextScene(ex);
        g.musicInSlides = this.musicPath;
        g.musicInSlidesId = this.bgId;
        g.setState(3);
      } else {
        if (g.functionalScene == null) { this.yetSkipped = true; g.goToNextChapter(); }
        g.storeAllEffects([]);
      }
      this.slides.stopMusic();
    }
  }

  // styled books: pages pre-rendered from the original Swing HTML renderer
  class StateBook extends GameState {
    constructor(game) {
      super(game);
      const g = game, b = g.book, a = g.assets;
      this.book = b;
      const res = E1.resourcesBlock(g, b.resources, null);
      const img = (k) => (res.assets.get(k) ? a.image(res.assets.get(k)) : null);
      this.background = img('background');
      let ln = img('arrowLeftNormal'), rn = img('arrowRightNormal'), lo = img('arrowLeftOver'), ro = img('arrowRightOver');
      const mirror = (im) => im && E1.canvasImage(im.width, im.height, (c) => { c.translate(im.width, 0); c.scale(-1, 1); c.drawImage(im.src, 0, 0); });
      if (!ln) {
        if (lo) ln = lo; else if (rn) ln = mirror(rn); else if (ro) ln = mirror(ro);
        else { ln = a.image('assets/special/DefaultLeftNormalArrow.png'); rn = mirror(ln); lo = a.image('assets/special/DefaultLeftOverArrow.png'); ro = mirror(lo); }
      }
      if (!rn) rn = ro || mirror(ln);
      if (!lo) lo = ln;
      if (!ro) ro = mirror(lo);
      Object.assign(this, { ln, rn, lo, ro, curL: ln, curR: rn });
      this.prev = b.previousPage; this.next = b.nextPage;
      if (!this.prev || !this.next) {
        this.prev = { x: 20, y: this.background.height - ln.height - 20 };
        this.next = { x: this.background.width - rn.width - 20, y: this.background.height - rn.height - 20 };
      }
      this.pages = b.pages.map((p, i) => ({ page: p, img: a.image('book:' + b.id + ':' + i) })).filter((p) => p.img);
      this.current = 0;
      g.gui.setDefaultCursor();
    }
    inArrow(x, y, pt, img) {
      if (pt.x < x && x < pt.x + img.width && pt.y < y && y < pt.y + img.height) {
        try { return img.alpha(x - pt.x, y - pt.y) > 128; } catch (e) { return false; }
      }
      return false;
    }
    isInPreviousPage(x, y) { return this.inArrow(x, y, this.prev, this.curL); }
    isInNextPage(x, y) { return this.inArrow(x, y, this.next, this.curR); }
    mainLoop() {
      const gui = this.game.gui, g = gui.g;
      gui.begin();
      if (this.background) g.drawImage(this.background.src, 0, 0);
      const p = this.pages[this.current];
      if (p) g.drawImage(p.img.src, 0, 0, 800, 600);
      if (this.current !== 0) g.drawImage(this.curL.src, this.prev.x, this.prev.y);
      g.drawImage(this.curR.src, this.next.x, this.next.y);
    }
    mouseClicked(e) {
      if (e.button === 1) {
        if (this.isInPreviousPage(e.x, e.y)) this.browsePrevious();
        else if (this.isInNextPage(e.x, e.y)) this.browseNext();
        // touch screens have no right click to close the book: a tap away from the arrows does it
        else if (e.touch) this.close();
      } else if (e.button === 3) this.close();
    }
    mouseMoved(e) {
      this.curL = this.isInPreviousPage(e.x, e.y) ? this.lo : this.ln;
      this.curR = this.isInNextPage(e.x, e.y) ? this.ro : this.rn;
      this.game.gui.setCursor(this.curL === this.lo || this.curR === this.ro ? 'pointer' : 'default');
    }
    browseNext() {
      if (this.current === this.pages.length - 1 || this.pages.length === 0) this.close();
      else { this.curR = this.rn; this.current++; }
    }
    browsePrevious() { if (this.current > 0) { this.curL = this.ln; this.current--; } }
    close() { this.game.gui.setDefaultCursor(); this.game.storeAllEffects([]); }
    keyPressed(e) {
      if (e.keyCode === 37) this.browsePrevious();
      else if (e.keyCode === 39) this.browseNext();
      else if (e.keyCode === 10 || e.keyCode === 27) this.close();
    }
  }

  // ---------------------------------------------------------------- conversations
  class StateConversation extends GameState {
    constructor(game) {
      super(game);
      const g = game;
      this.RESPONSE_TEXT_NUMBER_LINES = 5;
      this.RESPONSE_TEXT_ASCENT = g.gui.font.ascent;
      this.RESPONSE_TEXT_HEIGHT = this.RESPONSE_TEXT_ASCENT + 2;
      this.node = g.conversation.root;
      this.originalConvID = g.conversation.id;
      this.currentLine = 0; this.firstLineDisplayed = 0; this.optionHighlighted = -1; this.button = 0;
      this.firstTime = false; this.optionSelected = 0; this.isOptionSelected = false; this.keyDown = false;
      this.numberDisplayedOptions = 0; this.correspondingIndex = []; this.optionsToShow = [];
      this.generalKeepShowing = g.descriptor.keepShowing; this.convID = '';
      this.lastConversationLine = null;
      this.timeShowing = 0; this.lineOffset = 0; this.lineToShift = -1; this.msShift = 0; this.lastStop = 0;
    }
    talker(line) {
      const g = this.game;
      if (line.name === 'Player') return g.functionalPlayer;
      if (line.name === 'NPC') return g.currentNPC;
      return g.functionalScene.getNPC(line.name);
    }
    mainLoop(l) {
      const g = this.game, gui = g.gui;
      gui.toggleHud(false);
      gui.setDefaultCursor();
      g.functionalScene.update(l);
      gui.update(l);
      gui.begin();
      g.functionalScene.draw();
      gui.drawScene(l);
      if (this.node.type === 0) this.processDialogNode();
      else if (!this.isOptionSelected) { this.showPlayerQuestion(); this.optionNodeNoOptionSelected(l); }
      else this.optionNodeWithOptionSelected();
    }
    processDialogNode() {
      const g = this.game;
      if (this.button === 0) {
        if (g.characterCurrentlyTalking == null || !g.characterCurrentlyTalking.isTalking()) this.playNextLine();
      } else if (this.button === 1) { this.playNextLine(); this.button = 0; }
      else if (this.button === 3) { this.currentLine = this.node.lines.length; this.playNextLine(); this.button = 0; }
      this.firstTime = true;
    }
    showPlayerQuestion() {
      const g = this.game;
      if (!this.node.keepShowing) return;
      let fe = this.lastConversationLine.name === 'Player' ? g.functionalPlayer : (this.lastConversationLine.name === 'NPC' ? g.currentNPC : g.functionalScene.getNPC(this.lastConversationLine.name));
      if (fe != null) {
        if (this.firstTime) {
          if (this.lastConversationLine.audio) this.lastConvAudioId = fe.speakAudio(this.lastConversationLine.text, this.lastConversationLine.audio, true);
        } else fe.speak(this.lastConversationLine.text, true);
      } else fe = g.functionalPlayer;
      g.characterCurrentlyTalking = fe;
    }
    optionNodeNoOptionSelected(l) {
      if (this.firstTime) {
        if (this.node.random) this.doRandom();
        this.firstTime = false; this.firstLineDisplayed = 0; this.timeShowing = 0; this.msShift = 0;
      }
      this.numberDisplayedOptions = 0;
      this.storeOKLines();
      if (this.optionHighlighted === -1) { this.lineToShift = -1; this.lineOffset = 0; this.timeShowing = 0; this.msShift = 0; }
      const N = this.RESPONSE_TEXT_NUMBER_LINES;
      if (this.optionsToShow.length <= N) {
        for (let i = 0; i < this.optionsToShow.length; i++) { this.drawLine(this.optionsToShow[i].text, i, i, l); this.numberDisplayedOptions++; }
      } else {
        const n2 = Math.min(this.firstLineDisplayed + N - 1, this.optionsToShow.length);
        let n;
        for (n = this.firstLineDisplayed; n < n2; n++) { this.drawLine(this.optionsToShow[n].text, n - this.firstLineDisplayed, n, l); this.numberDisplayedOptions++; }
        this.drawLine(this.game.strings.get('GameText.More') || '...', n - this.firstLineDisplayed, n, l);
      }
      if (this.numberDisplayedOptions === 0) this.endConversation();
    }
    doRandom() {
      const node = this.node;
      if (node.lines.length === 0) return;
      const lines = node.lines.slice(), kids = node.children.slice(), nl = [], nk = [];
      for (let i = lines.length; i > 1; i--) { const k = Math.floor(Math.random() * i); nl.push(lines.splice(k, 1)[0]); nk.push(kids.splice(k, 1)[0]); }
      nl.push(lines[0]); nk.push(kids[0]);
      node.lines = nl; node.children = nk;
    }
    storeOKLines() {
      this.optionsToShow = []; this.correspondingIndex = [];
      this.node.lines.forEach((ln, i) => { if (E1.condOk(this.game, ln.conditions)) { this.optionsToShow.push(ln); this.correspondingIndex.push(i); } });
    }
    drawLine(s, n, n2, l) {
      const g = this.game, gui = g.gui, f = gui.font, pl = g.functionalPlayer.player;
      let color = pl.textFront;
      if (n === this.optionHighlighted) {
        const c = parseInt(color.substring(1), 16);
        color = '#' + (0xffffff - c).toString(16).padStart(6, '0');
        if (this.lineToShift !== n2) { this.lineToShift = n2; this.lineOffset = 0; this.timeShowing = 0; this.msShift = 0; }
        const d = f.widthFrac(s), d2 = f.stringWidth('A', true);
        const n7 = trunc(800 / d2) + 20;
        if (d >= 800) {
          this.timeShowing += l;
          this.lineOffset = trunc(this.timeShowing / 200);
          const n8 = s.substring(0, n7).length;
          if (this.lineOffset + n8 <= s.length) s = s.substring(this.lineOffset % s.length, this.lineOffset % s.length + n8);
          else {
            if (this.msShift < 200) this.lastStop = this.lineOffset % s.length;
            else if (this.msShift > 400) { this.lineOffset = 0; this.timeShowing = 0; this.msShift = 0; }
            s = s.substring(this.lastStop);
            this.msShift++;
          }
        }
      }
      const y = this.node.y + n * this.RESPONSE_TEXT_HEIGHT + this.RESPONSE_TEXT_ASCENT;
      const x = this.node.x;
      gui.drawStringOnto(f, (n2 + 1) + '.- ' + s, x, y, false, color, pl.textBorder, true, pl.showsSpeechBubble);
    }
    optionNodeWithOptionSelected() {
      const g = this.game;
      if (this.lineToShift === -1) { this.lineOffset = 0; this.timeShowing = 0; this.msShift = 0; }
      const ct = g.characterCurrentlyTalking;
      if (ct != null && ct.isTalking()) {
        if (this.button === 1) { ct.stopTalking(); this.button = 0; }
        else if (this.button === 3) ct.stopTalking();
        else return;
      }
      const node = this.node;
      if (!node.effectConsumed) {
        node.effectConsumed = true;
        g.pushCurrentState(this);
        g.storeEffectsInQueue(E1.buildEffects(g, node.effects), true);
        g.gui.toggleHud(true);
      } else if (this.optionSelected >= 0 && this.optionSelected < node.children.length) {
        node.effectConsumed = false;
        this.node = node.children[this.correspondingIndex[this.optionSelected]];
        this.isOptionSelected = false;
      }
    }
    endConversation() {
      const g = this.game;
      for (const n of g.conversation.nodes) n.effectConsumed = false;
      g.gui.toggleHud(true);
      g.endConversation();
    }
    selectDisplayedOption() {
      const g = this.game;
      if (this.lineToShift === -1) { this.lineOffset = 0; this.timeShowing = 0; this.msShift = 0; }
      if (this.optionSelected >= 0 && this.optionSelected < this.optionsToShow.length) {
        const ct = g.characterCurrentlyTalking;
        if (ct != null && ct.isTalking()) ct.stopTalking();
        const p = g.functionalPlayer;
        const line = this.node.lines[this.correspondingIndex[this.optionSelected]];
        if (this.node.showUserOption) {
          if (line.audio) p.speakAudio(line.text, line.audio, this.generalKeepShowing);
          else p.speak(line.text, this.generalKeepShowing);
        } else p.speak('', false);
        g.characterCurrentlyTalking = p;
        this.isOptionSelected = true;
        this.keyDown = false;
      }
    }
    selectNoAllDisplayedOption() {
      const N = this.RESPONSE_TEXT_NUMBER_LINES;
      if (!this.keyDown) this.optionSelected += this.firstLineDisplayed;
      const n = Math.min(this.firstLineDisplayed + N - 1, this.optionsToShow.length);
      if (this.optionSelected === n) {
        this.firstLineDisplayed += N - 1;
        if (this.firstLineDisplayed >= this.optionsToShow.length) this.firstLineDisplayed = 0;
      } else if (this.optionSelected < n) this.selectDisplayedOption();
    }
    mouseClicked(e) {
      if (this.node.type === 1 && !this.isOptionSelected) {
        const n = this.node.y;
        if (n <= e.y && n + this.optionsToShow.length * this.RESPONSE_TEXT_HEIGHT + this.RESPONSE_TEXT_ASCENT >= e.y) {
          const row = idiv(e.y - n, this.RESPONSE_TEXT_HEIGHT);
          // Touch screens: the lines are small for a finger, so the first tap only
          // highlights an option and a second tap on it chooses it.
          if (e.touch) {
            const a = this.touchArmed;
            if (!a || a.node !== this.node || a.row !== row || a.first !== this.firstLineDisplayed) {
              this.touchArmed = { node: this.node, row, first: this.firstLineDisplayed };
              this.optionHighlighted = row;
              return;
            }
            this.touchArmed = null;
          }
          this.optionSelected = row;
          if (this.optionsToShow.length <= this.RESPONSE_TEXT_NUMBER_LINES) this.selectDisplayedOption();
          else this.selectNoAllDisplayedOption();
        }
      } else if (this.node.type === 0 || this.isOptionSelected) {
        if (e.button === 1) this.button = 1; else if (e.button === 3) this.button = 3;
      }
    }
    keyPressed(e) {
      if (this.node.type === 1 && !this.isOptionSelected) {
        this.optionSelected = e.keyCode >= 49 && e.keyCode <= 57 ? e.keyCode - 49 : -1;
        this.keyDown = true;
        if (this.optionsToShow.length <= this.RESPONSE_TEXT_NUMBER_LINES) this.selectDisplayedOption();
        else if (this.optionSelected >= this.firstLineDisplayed && this.optionSelected <= this.numberDisplayedOptions + this.firstLineDisplayed) this.selectNoAllDisplayedOption();
      } else if (this.node.type === 0) {
        if (e.keyCode === 39) this.button = 1;
        else if (e.keyCode === 34 || e.keyCode === 27) this.button = 3;
      }
    }
    mouseMoved(e) {
      if (this.node.type === 1) {
        const n = this.node.y;
        this.optionHighlighted = (n <= e.y && e.y < n + this.node.lines.length * this.RESPONSE_TEXT_HEIGHT) ? idiv(e.y - n, this.RESPONSE_TEXT_HEIGHT) : -1;
      }
    }
    playNextLine() {
      const g = this.game, ct = g.characterCurrentlyTalking;
      if (ct != null && ct.isTalking()) ct.stopTalking();
      if (this.currentLine < this.node.lines.length) this.playNextLineInNode();
      else this.skipToNextNode();
    }
    playNextLineInNode() {
      const g = this.game, node = this.node;
      if (this.currentLine + 1 === node.lines.length && node.children.length && node.children[0].type === 1 && node.children[0].keepShowing) {
        ++this.currentLine;
        this.skipToNextNode();
        return;
      }
      const line = node.lines[this.currentLine];
      if (E1.condOk(g, line.conditions)) {
        const fe = this.talker(line);
        if (fe != null) {
          const keep = this.generalKeepShowing || node.keepShowing || line.keepShowing;
          if (line.audio) fe.speakAudio(line.text, line.audio, keep); else fe.speak(line.text, keep);
        }
        g.characterCurrentlyTalking = fe || null;
      }
      ++this.currentLine;
    }
    skipToNextNode() {
      const g = this.game, node = this.node;
      this.lastConversationLine = this.currentLine !== 0 ? node.lines[this.currentLine - 1] : { name: 'fake', text: '', audio: '' };
      if (!node.effectConsumed) {
        node.effectConsumed = true;
        g.pushCurrentState(this);
        g.storeEffectsInQueue(E1.buildEffects(g, node.effects), true);
        g.gui.toggleHud(true);
      } else if (node.children.length === 0) this.endConversation();
      else {
        node.effectConsumed = false;
        this.node = node.children[0];
        this.firstLineDisplayed = 0; this.currentLine = 0;
      }
    }
  }

  // ---------------------------------------------------------------- options menu (Esc)
  class StateOptions extends GameState {
    constructor(game) {
      super(game);
      const g = game, a = g.assets, L = g.langDir;
      this.panels = ['OptionsPanel', 'SaveLoadPanel', 'SavePanel', 'LoadPanel', 'ConfigurationPanel'].map((p) => a.image('gui/options/' + L + '/' + p + '.png'));
      this.btn = a.image('gui/options/Button.png'); this.btnOver = a.image('gui/options/PressedButton.png');
      this.buttonOffset = Math.max(this.btn.height, this.btnOver.height) - 48;
      this.font = new E1.JFont(23, true, 0.875, '"EvongQuicksand", "Quicksand", sans-serif', { ascent: 0.75, descent: 0.17, lineGap: 0.03 });
      this.saveFont = new E1.JFont(17, true, 0.875, '"EvongQuicksand", "Quicksand", sans-serif', { ascent: 0.75, descent: 0.17, lineGap: 0.03 });
      this.currentPanel = 0; this.highlighted = -1; this.image = null;
      this.counts = [5, 3, 5, 5, 4];
      this.pos = this.panelPos(0);
      this.slots = g.saves.list();
      // the original moves the mouse pointer onto the first option (keyboard navigation support)
      this.index = 0; this.highlighted = 0;
    }
    panelPos(n) { const p = this.panels[n]; return { x: idiv(800 - p.width, 2), y: idiv(600 - p.height, 2) }; }
    changePanel(n) { this.currentPanel = n; this.pos = this.panelPos(n); this.highlighted = -1; this.slots = this.game.saves.list(); }
    mainLoop(l) {
      const g = this.game, gui = g.gui, c = gui.g, S = g.strings;
      gui.setDefaultCursor();
      if (!this.image) {
        gui.begin();
        g.functionalScene.draw(); gui.drawScene(l); gui.drawHUD(l);
        // ColorConvertOp to CS_GRAY written back into an sRGB image: luminance computed in linear light (D50 PCS)
        const snap = gui.snapshot();
        const gray = document.createElement('canvas'); gray.width = snap.width; gray.height = snap.height;
        const gg = gray.getContext('2d', { willReadFrequently: true }); gg.drawImage(snap, 0, 0);
        try {
          const id = gg.getImageData(0, 0, gray.width, gray.height), d = id.data;
          const lin = new Float32Array(256);
          for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
          const enc = (y) => (y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055);
          for (let i = 0; i < d.length; i += 4) {
            const y = Math.round(255 * enc(0.2225 * lin[d[i]] + 0.7169 * lin[d[i + 1]] + 0.0606 * lin[d[i + 2]]));
            d[i] = d[i + 1] = d[i + 2] = y;
          }
          gg.putImageData(id, 0, 0);
        } catch (e) { gg.filter = 'grayscale(1)'; gg.drawImage(snap, 0, 0); }
        this.image = gray;
      }
      gui.begin();
      c.drawImage(this.image, 0, 0, 800, 600);
      c.drawImage(this.panels[this.currentPanel].src, this.pos.x, this.pos.y);
      const by = (i) => this.pos.y + 40 + 48 * i - idiv(this.buttonOffset, 2);
      const ty = (i) => this.pos.y + 40 + 24 + 48 * i;
      const T = (k) => S.get(k) || k;
      if (this.currentPanel === 2 || this.currentPanel === 3) {
        let i;
        for (i = 0; i < 4; i++) {
          const s = this.slots[i];
          const hi = this.highlighted === i;
          c.drawImage((hi ? this.btnOver : this.btn).src, this.pos.x, by(i));
          const col = hi ? '#ffffff' : '#828282';
          if (s) this.drawLines([s.title, s.time], ty(i), col, this.saveFont);
          else this.drawLines([T('GameText.Empty')], ty(i), col, this.font);
        }
        const hi = this.highlighted === i;
        c.drawImage((hi ? this.btnOver : this.btn).src, this.pos.x, by(i));
        this.drawLines([T('GameText.Back')], ty(i), hi ? '#ffffff' : '#828282', this.font);
      } else {
        const o = g.options;
        const speeds = [T('GameText.Slow'), T('GameText.Normal'), T('GameText.Fast')];
        const list = this.currentPanel === 0 ? [T('GameText.Save/Load'), T('GameText.Configuration'), T('GameText.GenerateReport'), T('GameText.ExitGame'), T('GameText.BackToGame')]
          : this.currentPanel === 1 ? [T('GameText.Save'), T('GameText.Load'), T('GameText.Back')]
            : [T('GameText.Music') + ' ' + (o.isMusicActive() ? T('GameText.On') : T('GameText.Off')), T('GameText.Effects') + ' ' + (o.isEffectsActive() ? T('GameText.On') : T('GameText.Off')),
              T('GameText.TextSpeed') + ': ' + speeds[o.getTextSpeed()], T('GameText.Back')];
        for (let i = 0; i < this.counts[this.currentPanel]; i++) {
          const disabled = false;
          let col;
          if (disabled) col = '#dcdcdc';
          else { c.drawImage((this.highlighted === i ? this.btnOver : this.btn).src, this.pos.x, by(i)); col = this.highlighted === i ? '#ffffff' : '#828282'; }
          if (list.length <= i) continue;
          if (disabled) { c.drawImage(this.btn.src, this.pos.x, by(i)); c.save(); c.globalAlpha = 0.5; }
          this.drawLines([list[i]], ty(i), col, this.font);
          if (disabled) c.restore();
        }
      }
    }
    // GUI.drawString(Graphics2D, String[], x, y): centred block
    drawLines(lines, n2, color, f) {
      const gui = this.game.gui;
      const n3 = f.height * lines.length - f.leading - f.descent;
      let n4 = n2 - idiv(n3, 2) + idiv(f.ascent, 2);
      for (const s of lines) { gui.drawCenteredString(f, s, 400, n4, color); n4 += f.height; }
    }
    mouseMoved(e) {
      this.highlighted = -1;
      if (this.pos.x < e.x && e.x < this.pos.x + 250) {
        for (let i = 0; i < this.counts[this.currentPanel]; i++) {
          if (this.pos.y + 40 + 48 * i >= e.y || e.y >= this.pos.y + 40 + 48 * (i + 1)) continue;
          this.highlighted = i;
          if (this.currentPanel === 3 && i < 4 && !this.slots[i]) this.highlighted = -1;
        }
      }
    }
    mouseDragged(e) { this.mouseMoved(e); }
    mouseClicked(e) {
      this.mouseMoved(e);
      const h = this.highlighted, g = this.game;
      if (h === -1) return;
      switch (this.currentPanel) {
        case 0:
          if (h === 0) this.changePanel(1); else if (h === 1) this.changePanel(4);
          else if (h === 3) g.setGameOver(); else if (h === 4) this.backToGame();
          break;
        case 1: if (h === 0) this.changePanel(2); else if (h === 1) this.changePanel(3); else if (h === 2) this.changePanel(0); break;
        case 2: if (h === 4) this.changePanel(1); else { g.saves.save(h); this.slots = g.saves.list(); } break;
        case 3: if (h === 4) this.changePanel(1); else if (this.slots[h]) g.saves.load(h); break;
        case 4:
          if (h === 0) g.options.setMusicActive(!g.options.isMusicActive());
          else if (h === 1) g.options.setEffectsActive(!g.options.isEffectsActive());
          else if (h === 2) g.options.setTextSpeed((g.options.getTextSpeed() + 1) % 3);
          else if (h === 3) this.changePanel(0);
          break;
        default: break;
      }
    }
    backToGame() {
      const g = this.game;
      g.options.save();
      if (g.options.isMusicActive()) g.functionalScene.playBackgroundMusic(); else g.functionalScene.stopBackgroundMusic();
      if (!g.options.isEffectsActive()) g.mm.stopAllSounds();
      g.setState(1);
    }
    keyPressed(e) {
      const n = this.counts[this.currentPanel];
      if (e.keyCode === 27) {
        if (this.currentPanel === 0) { this.backToGame(); return; }
        if (this.currentPanel === 2 || this.currentPanel === 3) this.changePanel(1); else this.changePanel(0);
      } else if (e.keyCode === 37 || e.keyCode === 38) { this.index--; if (this.index < 0) this.index = Math.max(n - 1, 0); }
      else if (e.keyCode === 39 || e.keyCode === 40) { this.index++; if (this.index >= n) this.index = 0; }
      else if (e.keyCode === 10) {
        const h = Math.min(this.index, n - 1);
        this.mouseClicked({ x: this.pos.x + 125, y: this.pos.y + 40 + 48 * h + 24, button: 1 });
      }
      if (this.index >= this.counts[this.currentPanel]) this.index = 0;
      this.highlighted = this.index;
    }
  }

  // ---------------------------------------------------------------- save games (localStorage)
  class Saves {
    constructor(game) { this.game = game; this.key = 'evong-save-' + game.lang + '-'; }
    list() {
      const out = [];
      for (let i = 0; i < 4; i++) {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(this.key + i) || 'null'); } catch (e) { s = null; }
        out.push(s);
      }
      return out;
    }
    save(i) {
      const g = this.game, d = new Date();
      const data = {
        title: g.descriptor.title, time: d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'),
        totalTime: g.totalTime, flags: [...g.flags.flags], vars: [...g.vars.vars], items: [...g.itemSummary.st],
        inventory: g.inventory.items.map((it) => it.item.id), scene: g.functionalScene.scene.id,
        timers: g.timerManager.timers.map((t) => ({ state: t.state, elapsed: Math.floor(Date.now() / 1000) - t.lastUpdate })),
      };
      try { localStorage.setItem(this.key + i, JSON.stringify(data)); } catch (e) { /* storage full or blocked */ }
    }
    load(i) {
      const s = this.list()[i];
      if (!s) return;
      const g = this.game;
      g.totalTime = s.totalTime;
      for (const [k, v] of s.flags) if (g.flags.existFlag(k)) g.flags.flags.set(k, v);
      for (const [k, v] of s.vars) if (g.vars.existVar(k)) g.vars.vars.set(k, v);
      for (const [k, v] of s.items) if (g.itemSummary.st.has(k)) g.itemSummary.st.set(k, v);
      g.inventory = new E1.Inventory();
      for (const id of s.inventory) if (g.chapter.items.has(id)) g.inventory.storeItem(new E1.FunctionalItem(g, g.chapter.items.get(id), null, 0, 0));
      const now = Math.floor(Date.now() / 1000);
      (s.timers || []).forEach((t, k) => { const ft = g.timerManager.timers[k]; if (ft) { ft.state = t.state; ft.lastUpdate = now - t.elapsed; } });
      g.functionalPlayer.cancelActions(); g.functionalPlayer.cancelAnimations();
      if (g.functionalScene) g.functionalScene.stopBackgroundMusic();
      g.mm.stopAll();
      g.effectsQueue = [[]]; g.isConvEffectsBlock = []; g.numberConv = 0; g.stackOfState = [];
      g.functionalScene = new E1.FunctionalScene(g, g.chapter.scenes.get(s.scene), g.functionalPlayer, -1);
      g.lastMouseEvent = null;
      g.setState(1);
    }
  }

  // ===================================================================== Game
  class Game {
    constructor(opts) {
      this.canvas = opts.canvas; this.base = opts.base || ''; this.lang = opts.lang || 'es'; this.ui = opts.ui || {};
      this.langDir = this.lang === 'en' ? 'en_EN' : 'es_ES';
      this.assets = new E1.Assets(this.base, this.lang);
      this.gui = new E1.GUI(this, this.canvas);
      this.options = new Options();
      this.mm = new E1.Sounds(this);
      this.anims = new E1.AnimationCache(this);
      this.saves = new Saves(this);
      this.running = false; this.input = []; this.totalTime = 0;
      this.loadingProgress = 0; this.sphere = 10; this.sphereDir = 1;
    }
    async boot(onProgress) {
      const base = this.base, L = this.lang;
      const txt = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.text(); };
      this.loadingImage = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = base + 'assets/loading.jpg'; });
      this.gui.resize();
      this.startLoadingAnimation();
      const data = JSON.parse(await txt('data/game-' + L + '.json'));
      this.assets.manifest = data.manifest;
      this.chapter = E1.loadChapter(data.chapter);
      // the short sounds (effects and speech audio), to decode as soon as audio is unlocked
      this.fxPaths = [...new Set([...data.chapter.matchAll(/<(?:play-sound|speak-player|speak-char)\b[^>]*\buri="([^"]+)"/g)].map((m) => m[1]))];
      this.descriptor = E1.loadDescriptor(data.descriptor);
      this.strings = E1.loadStrings(data.engine);
      await this.loadFonts();
      await this.assets.loadPacks((f) => { this.loadingProgress = 10 + 70 * f; if (onProgress) onProgress(f); });
      await this.assets.decodeAll((f) => { this.loadingProgress = 80 + 20 * f; });
      this.loadingProgress = 100;
      this.makeCursors();
    }
    async loadFonts() {
      const D = E1.FONT_DATA || {};
      await Promise.all(Object.keys(D).map(async (k) => {
        const [fam, weight] = k.split('-');
        try { const f = new FontFace(fam, 'url(' + D[k] + ')', { weight }); await f.load(); document.fonts.add(f); } catch (e) { console.warn('font', k, e); }
      }));
    }
    makeCursors() {
      const c = this.gui.cursors, a = this.assets;
      const cur = (p, hx, hy, fallback) => { const u = a.urls.get(p); return u ? 'url("' + u + '") ' + hx + ' ' + hy + ', ' + fallback : fallback; };
      c.set('default', cur(this.descriptor.cursors.get('default') || 'gui/cursors/default.png', 0, 0, 'default'));
      c.set('over', cur(this.descriptor.cursors.get('over') || 'gui/cursors/over.png', 5, 5, 'pointer'));
      c.set('exit', cur(this.descriptor.cursors.get('exit') || 'gui/cursors/exit.png', 5, 5, 'pointer'));
      c.set('action', cur(this.descriptor.cursors.get('action') || 'gui/cursors/action.png', 5, 5, 'pointer'));
      c.set('pointer', 'pointer');
      this.gui.cursorKey = null; this.gui.setDefaultCursor();
    }
    startLoadingAnimation() {
      const step = () => {
        if (this.running) return;
        this.drawLoading();
        this.loadingRaf = requestAnimationFrame(step);
      };
      this.loadingRaf = requestAnimationFrame(step);
    }
    // SplashScreenImpl1_4
    drawLoading() {
      const gui = this.gui, g = gui.g;
      gui.resize(); gui.begin();
      if (this.loadingImage) g.drawImage(this.loadingImage, 0, 0, 800, 600);
      const p = Math.max(0, Math.min(100, Math.round(this.loadingProgress)));
      g.fillStyle = '#ef8a08';
      if (p > 0) { E1.roundRect(g, 200, 300, idiv(400 * p, 100), 50, 10); g.fill(); }
      g.lineWidth = 4; g.strokeStyle = '#000000'; E1.roundRect(g, 200, 300, 400, 50, 10); g.stroke();
      this.sphere += this.sphereDir * 0.6;
      if (this.sphere > 30) this.sphereDir = -1; else if (this.sphere < 5) this.sphereDir = 1;
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(400, 100, this.sphere, this.sphere, 0, 0, Math.PI * 2); g.fill();
    }
    // ---------------------------------------------------------------- start / loop
    begin() {
      this.mm.unlock();
      this.mm.preload((this.fxPaths || []).map((p) => this.assets.audioUrl(p)));
      this.startChapter();
      if (this.running) return;
      this.running = true;
      if (this.loadingRaf) cancelAnimationFrame(this.loadingRaf);
      this.last = performance.now(); this.acc = 0;
      const loop = (t) => {
        if (!this.running) return;
        this.frame(t);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    startChapter() {
      const ch = this.chapter;
      this.flags = new E1.FlagSummary(ch.flags);
      this.vars = new E1.VarSummary(ch.vars);
      this.timerManager = new E1.TimerManager(this);
      this.actionManager = new E1.ActionManager(this);
      this.itemSummary = new E1.ItemSummary(ch.items);
      this.inventory = new E1.Inventory();
      this.effectsQueue = [[]]; this.isConvEffectsBlock = []; this.numberConv = 0; this.stackOfState = [];
      this.functionalScene = null; this.lastNextScene = null; this.nextScene = null;
      this.characterCurrentlyTalking = null; this.currentNPC = null; this.book = null; this.conversation = null;
      this.musicInSlides = null; this.musicInSlidesId = -1;
      this.gameOver = false; this.nextChapter = false; this.lastMouseEvent = null;
      this.gui.hud = new E1.ContextualHUD(this);
      this.gui.transition = null; this.gui.background = null; this.gui.elementsToDraw = []; this.gui.textToDraw = []; this.gui.elementsToInteract = [];
      const ex = E1.newExit(ch.initial.id);
      this.setNextScene(ex);
      this.functionalPlayer = new E1.FunctionalPlayer(this, ch.player);
      this.functionalPlayer.isTransparentFlag = this.descriptor.playerTransparent;
      for (const t of ch.timers) this.timerManager.addTimer(t, this);
      this.currentState = new StateNextScene(this);
    }
    restart() {
      this.mm.stopAll();
      this.startChapter();
      if (!this.running) this.begin();
    }
    frame(t) {
      let d = t - this.last; this.last = t;
      if (d > 100) d = 100; if (d < 0) d = 0;
      this.acc += d;
      const l = Math.floor(this.acc); this.acc -= l;
      this.totalTime += l;
      this.gui.resize();
      const evs = this.input; this.input = [];
      try {
        for (const e of evs) this.dispatch(e);
        this.currentState.mainLoop(l);
        this.mm.update();
      } catch (err) {
        // keep the game alive; report once per message
        this.errors = this.errors || new Set();
        if (!this.errors.has(String(err))) { this.errors.add(String(err)); console.error(err); }
      }
      if ((this.nextChapter || this.gameOver) && !this.ended) {
        this.ended = true;
        if (this.functionalScene) this.functionalScene.stopBackgroundMusic();
        this.mm.stopAll();
        if (this.ui.onEnd) this.ui.onEnd(this.nextChapter ? 'completed' : 'quit');
      }
    }
    dispatch(e) {
      const s = this.currentState;
      switch (e.type) {
        case 'move': s.mouseMoved(e); this.lastMouseEvent = e; break;
        case 'drag': s.mouseDragged(e); this.lastMouseEvent = e; break;
        case 'down': s.mousePressed(e); break;
        case 'up': s.mouseReleased(e); break;
        case 'click': s.mouseClicked(e); break;
        case 'key': s.keyPressed(e); break;
        case 'cmd': this.debugCmd(e.text); break;
        default: break;
      }
    }
    // ---------------------------------------------------------------- Game.java API
    isTransparent() { return this.descriptor.playerTransparent; }
    isShowActions() { return this.descriptor.defaultClickAction === 'showActions'; }
    isInventoryFixed() { const p = this.descriptor.inventoryPosition; return p === 4 || p === 5; }
    showTopInventory() { const p = this.descriptor.inventoryPosition; return p === 2 || p === 4 || p === 1; }
    showBottomInventory() { const p = this.descriptor.inventoryPosition; return p === 3 || p === 1 || p === 5; }
    grabItem(id) {
      let fi = null;
      for (const it of this.functionalScene.getItems()) if (it.item.id === id) fi = it;
      if (fi == null) fi = new E1.FunctionalItem(this, this.chapter.items.get(id), null, 0, 0);
      else this.functionalScene.items.splice(this.functionalScene.items.indexOf(fi), 1);
      this.inventory.storeItem(fi);
      this.itemSummary.grabItem(id);
    }
    consumeItem(id) { if (this.itemSummary.isItemGrabbed(id)) { this.itemSummary.consumeItem(id); this.inventory.consumeItem(id); } }
    generateItem(id) {
      if (this.itemSummary.isItemNormal(id)) this.grabItem(id);
      else if (this.itemSummary.isItemConsumed(id)) {
        this.itemSummary.regenerateItem(id);
        this.inventory.storeItem(new E1.FunctionalItem(this, this.chapter.items.get(id), null, 0, 0));
        this.itemSummary.grabItem(id);
      }
    }
    setState(n) {
      this.gui.setDefaultCursor();
      switch (n) {
        case 0: this.currentState = new StateLoading(this); break;
        case 1: this.currentState = new StatePlaying(this); if (this.lastMouseEvent) this.currentState.mouseMoved(this.lastMouseEvent); break;
        case 2: this.currentState = new StateSlidescene(this); break;
        case 3: this.currentState = new StateNextScene(this); break;
        case 5: this.currentState = new StateRunEffects(this, this.isConvEffectsBlock[this.isConvEffectsBlock.length - 1]); break;
        case 9: this.currentState = new StateRunEffects(this, true); break;
        case 6: this.currentState = new StateBook(this); break;
        case 7: this.currentState = new StateConversation(this); break;
        case 8: this.currentState = new StateOptions(this); break;
        default: break;
      }
    }
    pushCurrentState(st) { this.stackOfState.push(st); this.currentState.convID = this.conversation.id; }
    evaluateState() {
      if (this.numberConv < this.stackOfState.length) {
        this.currentState = this.stackOfState.pop();
        this.setConversation(this.currentState.convID);
      } else if (!this.isEmptyFIFOinStack()) this.setState(5);
      else this.setState(1);
    }
    setGameOver() { this.gameOver = true; }
    goToNextChapter() { this.nextChapter = true; }
    setNextScene(exit) {
      if (!this.chapter.cutscenes.has(exit.nextSceneId) && this.functionalScene != null) {
        const sc = this.functionalScene.scene;
        this.lastNextScene = E1.newExit(sc.id);
        this.lastNextScene.destinyX = sc.posX; this.lastNextScene.destinyY = sc.posY;
      }
      this.nextScene = exit;
    }
    storeAllEffects(list, conv) { this.storeEffectsInQueue(E1.buildEffects(this, list), !!conv); }
    storeEffectsInQueue(list, conv) {
      this.isConvEffectsBlock.push(conv);
      this.effectsQueue.push(list.slice());
      if (conv) ++this.numberConv;
      if (!(this.currentState instanceof StateRunEffects)) this.setState(5);
    }
    getFirstElementOfTop() {
      const q = this.effectsQueue;
      let fe = null;
      const top = q[q.length - 1];
      if (q.length > 1 && top.length === 0) {
        q.pop();
        if (this.isConvEffectsBlock.pop()) --this.numberConv;
      } else if (top.length !== 0) {
        fe = top.shift();
        if (q.length > 1 && top.length === 0) {
          q.pop();
          if (this.isConvEffectsBlock.pop()) --this.numberConv;
        }
      }
      return fe;
    }
    isEmptyFIFOinStack() { return this.effectsQueue[this.effectsQueue.length - 1].length === 0; }
    endConversation() {
      if (!this.isEmptyFIFOinStack()) this.setState(5);
      else if (this.stackOfState.length) this.evaluateState();
      else this.setState(1);
    }
    setBook(id) {
      // The original also did lastNextScene = nextScene here, which points at the current scene: opening a
      // book (e.g. the tasks folder from the inventory) on the help screen then made its "back" button a no-op
      // and trapped the player. Left out on purpose.
      this.book = this.chapter.books.get(id);
    }
    setConversation(id) { this.conversation = this.chapter.conversations.get(id); }
    updateDataPendingFromState(bl) {
      this.timerManager.update(bl);
      this.functionalScene.updateScene();
    }
    // test hook (same commands as the desktop test launcher)
    debugCmd(line) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'flag') { if (p[2] === '1') this.flags.activateFlag(p[1]); else this.flags.deactivateFlag(p[1]); }
      else if (p[0] === 'var') this.vars.setVarValue(p[1], parseInt(p[2], 10));
      else if (p[0] === 'goto') { this.setNextScene(E1.newExit(p[1])); this.setState(3); }
      else if (p[0] === 'grab') this.generateItem(p[1]);
    }
    // ---------------------------------------------------------------- host integration
    pushInput(e) { this.input.push(e); }
    setHidden(h) { this.mm.setHidden(h); if (!h) this.last = performance.now(); }
  }

  // Java KeyEvent codes for the keys the engine reacts to
  E1.keyCode = function (ev) {
    const k = ev.key;
    if (k === 'Escape') return 27;
    if (k === 'Enter') return 10;
    if (k === 'ArrowLeft') return 37;
    if (k === 'ArrowUp') return 38;
    if (k === 'ArrowRight') return 39;
    if (k === 'ArrowDown') return 40;
    if (k === 'PageDown') return 34;
    if (k === ' ') return 32;
    if (/^[0-9]$/.test(k)) return 48 + parseInt(k, 10);
    if (k && k.length === 1) return k.toUpperCase().charCodeAt(0);
    return 0;
  };

  E1.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);

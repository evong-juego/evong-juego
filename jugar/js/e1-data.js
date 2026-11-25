/* EVONG web: eAdventure 1.x chapter loader (port of the common/loader subparsers). */
(function (global) {
  'use strict';
  const E1 = global.E1 || (global.E1 = {});
  const MIN_INT = -2147483648;

  // Java String.trim(): strips chars <= U+0020 only (keeps NBSP)
  function jtrim(s) {
    let a = 0, b = s.length;
    while (a < b && s.charCodeAt(a) <= 32) a++;
    while (b > a && s.charCodeAt(b - 1) <= 32) b--;
    return s.substring(a, b);
  }
  // Java String.split(regex): trailing empty strings removed
  function jsplit(s, re) {
    const parts = s.split(re);
    let n = parts.length;
    while (n > 0 && parts[n - 1] === '') n--;
    return n === 0 ? (s.length === 0 ? [''] : []) : parts.slice(0, n);
  }
  E1.jtrim = jtrim; E1.jsplit = jsplit; E1.MIN_INT = MIN_INT;

  const kids = (el, tag) => Array.from(el.children).filter((c) => !tag || c.tagName === tag);
  const kid = (el, tag) => Array.from(el.children).find((c) => c.tagName === tag) || null;
  const attr = (el, name, def) => (el.hasAttribute(name) ? el.getAttribute(name) : def);
  const iattr = (el, name, def) => (el.hasAttribute(name) ? parseInt(el.getAttribute(name), 10) : def);
  const yes = (el, name, def) => (el.hasAttribute(name) ? el.getAttribute(name) === 'yes' : def);
  const text = (el) => (el ? jtrim(el.textContent) : '');

  // ---------------------------------------------------------------- conditions
  // {simple: [{t:'flag',id,active} | {t:'var',id,op,value}], either: [[...]]}
  const VAR_OPS = { 'greater-than': 2, 'greater-equals-than': 3, equals: 4, 'less-equals-than': 5, 'less-than': 6, 'not-equals': 7 };
  function emptyConditions() { return { simple: [], either: [] }; }
  function parseCondList(el, chapter) {
    const out = [];
    for (const c of kids(el)) {
      const t = c.tagName;
      if (t === 'active' || t === 'inactive') {
        out.push({ t: 'flag', id: c.getAttribute('flag'), active: t === 'active' });
        chapter.flags.add(c.getAttribute('flag'));
      } else if (VAR_OPS[t]) {
        out.push({ t: 'var', id: c.getAttribute('var'), op: VAR_OPS[t], value: iattr(c, 'value', 0) });
        chapter.vars.add(c.getAttribute('var'));
      }
    }
    return out;
  }
  function parseConditions(el, chapter) {
    const conds = emptyConditions();
    if (!el) return conds;
    for (const c of kids(el)) {
      if (c.tagName === 'either') conds.either.push(parseCondList(c, chapter));
    }
    conds.simple = parseCondList(el, chapter);
    return conds;
  }

  // ---------------------------------------------------------------- effects
  const EFFECT_TYPES = {
    activate: 0, deactivate: 1, 'consume-object': 2, 'generate-object': 3, 'cancel-action': 4, 'speak-player': 5,
    'speak-char': 6, 'trigger-book': 7, 'play-sound': 8, 'play-animation': 9, 'move-player': 10, 'move-npc': 11,
    'trigger-conversation': 12, 'trigger-cutscene': 13, 'trigger-scene': 14, 'trigger-last-scene': 15,
    'random-effect': 16, 'set-value': 17, increment: 18, decrement: 19, 'macro-ref': 20, 'wait-time': 21,
    'show-text': 22, 'highlight-item': 23, 'move-object': 24,
  };
  function parseEffect(c, chapter) {
    const type = EFFECT_TYPES[c.tagName];
    if (type === undefined) return null;
    const e = { type, conditions: emptyConditions() };
    switch (type) {
      case 0: case 1: e.target = c.getAttribute('flag'); chapter.flags.add(e.target); break;
      case 17: case 18: case 19:
        e.target = c.getAttribute('var'); e.value = iattr(c, 'value', 0); chapter.vars.add(e.target); break;
      case 20: e.target = c.getAttribute('id'); break;
      case 2: case 3: case 7: case 12: case 13: e.target = c.getAttribute('idTarget'); break;
      case 5: e.line = text(c); e.audio = attr(c, 'uri', ''); break;
      case 6: e.target = attr(c, 'idTarget', null); e.line = text(c); e.audio = attr(c, 'uri', ''); break;
      case 8: e.background = c.getAttribute('background') === 'yes'; e.path = attr(c, 'uri', ''); break;
      case 11: case 10: e.target = attr(c, 'idTarget', null); e.x = iattr(c, 'x', 0); e.y = iattr(c, 'y', 0); break;
      case 14: e.target = attr(c, 'idTarget', ''); e.x = iattr(c, 'x', 0); e.y = iattr(c, 'y', 0); break;
      case 21: e.time = iattr(c, 'time', 0); break;
      case 22: e.line = text(c); e.x = iattr(c, 'x', 0); e.y = iattr(c, 'y', 0);
        e.front = attr(c, 'frontColor', '#FFFFFF'); e.border = attr(c, 'borderColor', '#000000'); break;
      default: break;
    }
    return e;
  }
  // an <effect>-like element: effect tags each optionally followed by a <condition>
  function parseEffects(el, chapter) {
    const list = [];
    if (!el) return list;
    let cur = null;
    for (const c of kids(el)) {
      if (c.tagName === 'condition') { if (cur) cur.conditions = parseConditions(c, chapter); continue; }
      const e = parseEffect(c, chapter);
      if (e) { list.push(e); cur = e; }
    }
    return list;
  }

  // ---------------------------------------------------------------- common blocks
  function parseResources(el, chapter) {
    const assets = new Map();
    for (const a of kids(el, 'asset')) assets.set(a.getAttribute('type'), a.getAttribute('uri'));
    return { name: attr(el, 'name', ''), assets, conditions: parseConditions(kid(el, 'condition'), chapter) };
  }
  function resourcesOf(el, chapter) { return kids(el, 'resources').map((r) => parseResources(r, chapter)); }
  function parseDescriptions(el, chapter) {
    return kids(el, 'description').map((d) => ({
      name: text(kid(d, 'name')), brief: text(kid(d, 'brief')), detailed: text(kid(d, 'detailed')),
      nameSound: attr(kid(d, 'name') || d, 'soundPath', ''), briefSound: attr(kid(d, 'brief') || d, 'soundPath', ''),
      detailedSound: attr(kid(d, 'detailed') || d, 'soundPath', ''),
      conditions: kid(d, 'condition') ? parseConditions(kid(d, 'condition'), chapter) : null,
    }));
  }
  const ACTION_TYPES = { examine: 0, grab: 1, 'give-to': 2, 'use-with': 3, use: 4, custom: 5, 'custom-interact': 6, 'talk-to': 7, 'drag-to': 8 };
  function parseActions(el, chapter) {
    const out = [];
    if (!el) return out;
    for (const a of kids(el)) {
      const type = ACTION_TYPES[a.tagName];
      if (type === undefined) continue;
      out.push({
        type,
        target: attr(a, 'idTarget', null),
        name: attr(a, 'name', null),
        needsGoTo: yes(a, 'needsGoTo', false),
        keepDistance: iattr(a, 'keepDistance', 0),
        activatedNotEffects: yes(a, 'not-effects', false),
        conditions: parseConditions(kid(a, 'condition'), chapter),
        effects: parseEffects(kid(a, 'effect'), chapter),
        notEffects: parseEffects(kid(a, 'not-effect'), chapter),
        resources: resourcesOf(a, chapter),
        conditionsAreMeet: false,
      });
    }
    return out;
  }
  function parseTextColor(el, holder) {
    holder.textFront = '#FFFFFF'; holder.textBorder = '#000000';
    holder.bubbleBkg = '#FFFFFF'; holder.bubbleBorder = '#000000'; holder.showsSpeechBubble = false;
    const tc = el && kid(el, 'textcolor');
    if (!tc) return;
    holder.showsSpeechBubble = tc.getAttribute('showsSpeechBubble') === 'yes';
    holder.bubbleBkg = attr(tc, 'bubbleBkgColor', holder.bubbleBkg);
    holder.bubbleBorder = attr(tc, 'bubbleBorderColor', holder.bubbleBorder);
    const f = kid(tc, 'frontcolor'), b = kid(tc, 'bordercolor');
    if (f) holder.textFront = f.getAttribute('color');
    if (b) holder.textBorder = b.getAttribute('color');
  }
  function points(el) { return kids(el, 'point').map((p) => ({ x: iattr(p, 'x', 0), y: iattr(p, 'y', 0) })); }

  // ---------------------------------------------------------------- top level elements
  function parseScene(el, chapter) {
    const s = {
      kind: 0, id: el.getAttribute('id'), start: el.getAttribute('start') === 'yes',
      playerLayer: iattr(el, 'playerLayer', -1), playerScale: parseFloat(attr(el, 'playerScale', '1')),
      resources: resourcesOf(el, chapter), name: text(kid(el, 'name')),
      exits: [], itemRefs: [], charRefs: [], atrezzoRefs: [], activeAreas: [], barriers: [], trajectory: null,
      posX: MIN_INT, posY: MIN_INT,
    };
    const dp = kid(el, 'default-initial-position');
    if (dp) { s.posX = iattr(dp, 'x', MIN_INT); s.posY = iattr(dp, 'y', MIN_INT); }
    const ex = kid(el, 'exits');
    if (ex) for (const e of kids(ex, 'exit')) {
      const look = kid(e, 'exit-look');
      s.exits.push({
        x: iattr(e, 'x', 0), y: iattr(e, 'y', 0), width: iattr(e, 'width', 0), height: iattr(e, 'height', 0),
        rectangular: attr(e, 'rectangular', 'yes') === 'yes', points: points(e),
        nextSceneId: attr(e, 'idTarget', ''), destinyX: iattr(e, 'destinyX', MIN_INT), destinyY: iattr(e, 'destinyY', MIN_INT),
        transitionType: iattr(e, 'transitionType', 0), transitionTime: iattr(e, 'transitionTime', 0),
        hasNotEffects: yes(e, 'not-effects', false),
        look: look ? { text: look.hasAttribute('text') ? look.getAttribute('text') : null,
          cursor: attr(look, 'cursor-path', null), sound: attr(look, 'sound-path', null) } : null,
        conditions: parseConditions(kid(e, 'condition'), chapter),
        effects: parseEffects(kid(e, 'effect'), chapter),
        notEffects: parseEffects(kid(e, 'not-effect'), chapter),
        postEffects: parseEffects(kid(e, 'post-effect'), chapter),
      });
    }
    const refs = (container, tag, list) => {
      const c = kid(el, container);
      if (!c) return;
      for (const r of kids(c, tag)) {
        let layer = iattr(r, 'layer', 0);
        if (layer === -1) layer = 0;
        const sc = parseFloat(attr(r, 'scale', '0'));
        list.push({
          target: r.getAttribute('idTarget'), x: iattr(r, 'x', 0), y: iattr(r, 'y', 0), layer,
          scale: (sc > 0.001 || sc < -0.001) ? sc : 1,
          conditions: parseConditions(kid(r, 'condition'), chapter),
        });
      }
    };
    refs('objects', 'object-ref', s.itemRefs);
    refs('characters', 'character-ref', s.charRefs);
    refs('atrezzo', 'atrezzo-ref', s.atrezzoRefs);
    const aa = kid(el, 'active-areas');
    if (aa) for (const a of kids(aa, 'active-area')) {
      s.activeAreas.push({
        id: a.getAttribute('id'), x: iattr(a, 'x', 0), y: iattr(a, 'y', 0), width: iattr(a, 'width', 0), height: iattr(a, 'height', 0),
        rectangular: attr(a, 'rectangular', 'yes') === 'yes', points: points(a),
        conditions: parseConditions(kid(a, 'condition'), chapter),
        descriptions: parseDescriptions(a, chapter), actions: parseActions(kid(a, 'actions'), chapter),
        resources: [],
      });
    }
    return s;
  }
  function parseItem(el, chapter) {
    const b = attr(el, 'behaviour', 'normal');
    return {
      id: el.getAttribute('id'), behaviour: b === 'atrezzo' ? 1 : b === 'first-action' ? 2 : 0,
      resourcesTransitionTime: iattr(el, 'resources-transition-time', 0),
      returnsWhenDragged: attr(el, 'returnsWhenDragged', 'yes') === 'yes',
      resources: resourcesOf(el, chapter), descriptions: parseDescriptions(el, chapter),
      actions: parseActions(kid(el, 'actions'), chapter),
    };
  }
  function parseCharacter(el, chapter, isPlayer) {
    const c = {
      id: isPlayer ? 'Player' : el.getAttribute('id'), resources: resourcesOf(el, chapter),
      descriptions: parseDescriptions(el, chapter), actions: parseActions(kid(el, 'actions'), chapter),
    };
    parseTextColor(el, c);
    const v = kid(el, 'voice');
    c.voice = v ? attr(v, 'name', '') : '';
    c.alwaysSynthesizer = v ? v.getAttribute('synthesizeAlways') === 'yes' : false;
    return c;
  }
  function parseBook(el, chapter) {
    const b = {
      id: el.getAttribute('id'), resources: resourcesOf(el, chapter), type: 0, pages: [],
      previousPage: el.hasAttribute('xPreviousPage') ? { x: iattr(el, 'xPreviousPage', 0), y: iattr(el, 'yPreviousPage', 0) } : null,
      nextPage: el.hasAttribute('xNextPage') ? { x: iattr(el, 'xNextPage', 0), y: iattr(el, 'yNextPage', 0) } : null,
    };
    const pages = kid(el, 'pages');
    if (pages) {
      b.type = 1;
      const T = { url: 0, resource: 1, image: 2 };
      for (const p of kids(pages, 'page')) {
        b.pages.push({
          uri: p.getAttribute('uri'), type: T[attr(p, 'type', 'resource')] ?? 1,
          margin: iattr(p, 'margin', 0), marginEnd: iattr(p, 'marginEnd', 0), marginTop: iattr(p, 'marginTop', 0),
          marginBottom: iattr(p, 'marginBottom', 0), scrollable: yes(p, 'scrollable', false),
        });
      }
    }
    return b;
  }
  function parseConversation(el, chapter) {
    // parser state persists between nodes of the same conversation (as in GraphConversationSubParser)
    const st = { random: false, keepShowing: false, showUserOption: false, preListening: false, x: 0, y: 0,
      keepShowingDialogue: false, keepShowingLine: false, synth: null };
    const nodes = [], links = [];
    for (const n of kids(el)) {
      if (n.tagName !== 'dialogue-node' && n.tagName !== 'option-node') continue;
      let node;
      if (n.tagName === 'dialogue-node') {
        if (n.hasAttribute('keepShowing')) st.keepShowingDialogue = n.getAttribute('keepShowing') === 'yes';
        node = { type: 0, lines: [], children: [], effects: [], effectConsumed: false, keepShowing: st.keepShowingDialogue };
      } else {
        if (n.hasAttribute('random')) st.random = n.getAttribute('random') === 'yes';
        if (n.hasAttribute('keepShowing')) st.keepShowing = n.getAttribute('keepShowing') === 'yes';
        if (n.hasAttribute('showUserOption')) st.showUserOption = n.getAttribute('showUserOption') === 'yes';
        if (n.hasAttribute('preListening')) st.preListening = n.getAttribute('preListening') === 'yes';
        if (n.hasAttribute('x')) st.x = parseInt(n.getAttribute('x'), 10);
        if (n.hasAttribute('y')) st.y = parseInt(n.getAttribute('y'), 10);
        node = { type: 1, lines: [], children: [], effects: [], effectConsumed: false, random: st.random,
          keepShowing: st.keepShowing, showUserOption: st.showUserOption, preListening: st.preListening,
          x: st.x > 0 && st.y > 0 ? st.x : 10, y: st.x > 0 && st.y > 0 ? st.y : 480 };
      }
      const myLinks = [];
      let line = null;
      const walk = (parent) => {
        for (const c of kids(parent)) {
          const t = c.tagName;
          if (t === 'speak-player' || t === 'speak-char') {
            if (c.hasAttribute('synthesize')) st.synth = c.getAttribute('synthesize') === 'yes';
            if (c.hasAttribute('keepShowing')) st.keepShowingLine = c.getAttribute('keepShowing') === 'yes';
            line = { name: t === 'speak-player' ? 'Player' : attr(c, 'idTarget', 'NPC'), text: text(c),
              audio: attr(c, 'uri', ''), synth: st.synth, keepShowing: st.keepShowingLine, conditions: emptyConditions() };
            node.lines.push(line);
          } else if (t === 'condition') {
            if (line) line.conditions = parseConditions(c, chapter);
          } else if (t === 'child') {
            myLinks.push(parseInt(c.getAttribute('nodeindex'), 10));
          } else if (t === 'effect') {
            node.effects = parseEffects(c, chapter);
          } else if (t === 'end-conversation') {
            walk(c);
          }
        }
      };
      walk(n);
      nodes.push(node); links.push(myLinks);
    }
    nodes.forEach((node, i) => {
      for (const l of links[i]) {
        if (node.type === 0 && node.children.length) continue; // dialogue nodes take a single child
        node.children.push(nodes[l]);
      }
    });
    return { id: el.getAttribute('id'), root: nodes[0], nodes };
  }
  function parseTimer(el, chapter) {
    return {
      time: iattr(el, 'time', 0), usesEndCondition: yes(el, 'usesEndCondition', true), runsInLoop: yes(el, 'runsInLoop', true),
      multipleStarts: yes(el, 'multipleStarts', true), showTime: yes(el, 'showTime', false), countDown: yes(el, 'countDown', false),
      showWhenStopped: yes(el, 'showWhenStopped', false), displayName: attr(el, 'displayName', 'timer'),
      initCond: parseConditions(kid(el, 'init-condition'), chapter), endCond: parseConditions(kid(el, 'end-condition'), chapter),
      effects: parseEffects(kid(el, 'effect'), chapter), postEffects: parseEffects(kid(el, 'post-effect'), chapter),
    };
  }
  function parseSlidescene(el, chapter) {
    const next = attr(el, 'next', 'go-back');
    return {
      kind: 1, id: el.getAttribute('id'), start: el.getAttribute('start') === 'yes', resources: resourcesOf(el, chapter),
      name: text(kid(el, 'name')), next: next === 'new-scene' ? 2 : next === 'end-chapter' ? 1 : 0,
      targetId: attr(el, 'idTarget', null), destinyX: iattr(el, 'destinyX', MIN_INT), destinyY: iattr(el, 'destinyY', MIN_INT),
      transitionType: iattr(el, 'transitionType', 0), transitionTime: iattr(el, 'transitionTime', 0),
      effects: parseEffects(kid(el, 'end-effect'), chapter),
    };
  }

  E1.loadChapter = function (xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;
    const ch = {
      scenes: new Map(), cutscenes: new Map(), general: new Map(), items: new Map(), atrezzo: new Map(),
      characters: new Map(), player: null, books: new Map(), conversations: new Map(), macros: new Map(),
      timers: [], flags: new Set(), vars: new Set(), initial: null, generalOrder: [],
    };
    for (const el of kids(root)) {
      switch (el.tagName) {
        case 'scene': { const s = parseScene(el, ch); ch.scenes.set(s.id, s); ch.general.set(s.id, s); ch.generalOrder.push(s); break; }
        case 'slidescene': { const s = parseSlidescene(el, ch); ch.cutscenes.set(s.id, s); ch.general.set(s.id, s); ch.generalOrder.push(s); break; }
        case 'object': { const it = parseItem(el, ch); ch.items.set(it.id, it); break; }
        case 'atrezzoobject': ch.atrezzo.set(el.getAttribute('id'), { id: el.getAttribute('id'), resources: resourcesOf(el, ch), descriptions: parseDescriptions(el, ch) }); break;
        case 'character': { const c = parseCharacter(el, ch, false); ch.characters.set(c.id, c); break; }
        case 'player': ch.player = parseCharacter(el, ch, true); break;
        case 'book': { const b = parseBook(el, ch); ch.books.set(b.id, b); break; }
        case 'graph-conversation': { const c = parseConversation(el, ch); ch.conversations.set(c.id, c); break; }
        case 'macro': ch.macros.set(el.getAttribute('id'), { id: el.getAttribute('id'), effects: parseEffects(el, ch) }); break;
        case 'timer': ch.timers.push(parseTimer(el, ch)); break;
        default: break;
      }
    }
    ch.initial = ch.generalOrder.find((s) => s.start) || ch.generalOrder[0];
    return ch;
  };

  E1.loadDescriptor = function (xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;
    const cfg = root.querySelector('configuration');
    const gui = root.querySelector('gui');
    const d = {
      title: text(root.querySelector('title')),
      defaultClickAction: attr(cfg, 'defaultClickAction', 'showDetails'),
      keepShowing: attr(cfg, 'keepShowing', 'no') === 'yes',
      dragBehaviour: attr(cfg, 'dragBehaviour', 'considerNonTargets'),
      guiType: attr(gui, 'type', 'contextual') === 'contextual' ? 1 : 0,
      inventoryPosition: { none: 0, 'top-bottom': 1, top: 2, bottom: 3, 'fixed-top': 4, 'fixed-bottom': 5 }[attr(gui, 'inventoryPosition', 'top-bottom')] ?? 1,
      playerTransparent: (root.querySelector('mode') && root.querySelector('mode').getAttribute('playerTransparent') === 'yes'),
      buttons: new Map(), cursors: new Map(), arrows: new Map(), commentaries: false,
    };
    for (const b of root.querySelectorAll('buttons > button')) d.buttons.set(b.getAttribute('action') + '#' + b.getAttribute('type'), b.getAttribute('uri'));
    for (const c of root.querySelectorAll('cursors > cursor')) d.cursors.set(c.getAttribute('type'), c.getAttribute('uri'));
    for (const a of root.querySelectorAll('arrows > arrow')) d.arrows.set(a.getAttribute('type'), a.getAttribute('uri'));
    return d;
  };

  E1.loadStrings = function (xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const m = new Map();
    for (const e of doc.querySelectorAll('entry')) m.set(e.getAttribute('key'), e.textContent);
    return m;
  };

  E1.parseAnimation = function (xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const root = doc.documentElement;
    const T = { none: 0, fadein: 1, vertical: 2, horizontal: 3 };
    const a = { slides: root.getAttribute('slides') === 'yes', useTransitions: root.getAttribute('usetransitions') !== 'no', frames: [], transitions: [] };
    for (const c of kids(root)) {
      if (c.tagName === 'frame') {
        a.frames.push({ uri: attr(c, 'uri', ''), time: iattr(c, 'time', 100), waitforclick: c.getAttribute('waitforclick') === 'yes',
          soundUri: attr(c, 'soundUri', ''), maxSoundTime: iattr(c, 'maxSoundTime', 1000) });
      } else if (c.tagName === 'transition') {
        a.transitions.push({ time: iattr(c, 'time', 0), type: T[attr(c, 'type', 'none')] || 0 });
      }
    }
    return a;
  };
})(typeof window !== 'undefined' ? window : globalThis);

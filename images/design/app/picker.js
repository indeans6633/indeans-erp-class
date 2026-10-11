/* 디자인 선택창 — ① 화면 구조 → ② 스타일(추천 조합 7) → ③ 세부 조절(접힘: 색·내 색·모서리·밀도·밝기).
 * 고르는 즉시 미리 보기(목업)가 바뀐다.
 *
 * 이름·모양 값은 design-rules.js(window.ERP_DESIGN), 색은 color-engine.js(window.ERP_COLOR) 한 곳에서 읽는다.
 * 열린 방법에 따라 '이걸로 하기'가 다르게 움직인다.
 *   - 서버로 열림(http://127.0.0.1:…, design-pick.mjs): 고른 조합을 서버에 보내 파일을 만든다.
 *   - 파일로 열림(file://) 또는 서버 연결이 끊김: 조합 코드를 크게 보여 준다 → 대표가 AI 에게 말한다.
 * 바깥 주소로는 아무것도 보내지 않는다. 서버에 보내는 것은 고른 값(구조·스타일·색·시드·밝기·모서리·밀도)뿐이다.
 * 고르는 중의 상태는 이 페이지 주소 끝(#c=…)에만 둔다(새로 고침해도 그대로).
 * '내 색'을 넣으면 엔진이 바로 밝게·어둡게를 만들고, 대비 자가 검사를 통과해야 '이걸로 하기'를 누를 수 있다.
 */
(function () {
  'use strict';
  var R = window.ERP_DESIGN;
  function $(id) { return document.getElementById(id); }
  if (!R || !R.engine) { var fatal = $('pk-fatal'); if (fatal) fatal.hidden = false; return; }
  var E = R.engine;

  var DEVICES = [{ id: 'phone', ko: '휴대폰 (375)', w: 375, h: 720 }, { id: 'pc', ko: 'PC (1280)', w: 1280, h: 760 }];
  var PEEKS = [{ id: 'light', ko: '밝게로 보기' }, { id: 'dark', ko: '어둡게로 보기' }];
  var darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var state = {
    structure: R.defaults.structure, family: R.defaults.family, palette: R.defaults.palette, seed: R.seedOf({ palette: R.defaults.palette }),
    scheme: R.defaults.scheme, radius: R.defaults.radius, density: R.defaults.density,
    screen: 'list', device: (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) ? 'pc' : 'phone',
    peek: darkMq && darkMq.matches ? 'dark' : 'light'
  };
  var colorTouched = false;      // 대표(또는 AI 추천)가 색을 정했으면 스타일을 바꿔도 색을 유지한다
  var customSeed = '#2A6F9E';    // '내 색' 칸의 값(내 색을 고르지 않았어도 유지)
  var hexError = '';
  var server = { on: false, token: '', lost: false, fails: 0, lastTouch: 0, timer: null };
  var mockHeight = null;
  var loadedStructure = null;
  var saved = false;
  var userChanged = false;
  var recommend = null;

  /* ── 주소 끝(#)에 고르는 중의 상태를 둔다 ───────────────── */
  function readHash() {
    var out = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) { try { out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 건너뜀 */ } }
    });
    return out;
  }
  function code() { return R.makeCode(state); }
  function writeHash() {
    var h = '#c=' + code() + '&v=' + state.screen + '&d=' + state.device + '&p=' + state.peek;
    if (location.hash === h) return;
    try { history.replaceState(null, '', h); } catch (e) { try { location.replace(h); } catch (e2) { /* 그대로 둔다 */ } }
  }
  function applySel(sel) {
    ['structure', 'family', 'palette', 'seed', 'scheme', 'radius', 'density'].forEach(function (k) { if (sel[k] != null) state[k] = sel[k]; });
    if (state.palette === 'custom') customSeed = state.seed;
  }
  var fromHash = readHash();
  var hashSel = fromHash.c ? R.parseCode(fromHash.c) : null;
  if (hashSel) {
    applySel(hashSel);
    var cc0 = R.comboColor(state.family);
    colorTouched = !(cc0.palette === state.palette && cc0.seed === state.seed);
  }
  if (R.byId(R.screens, fromHash.v)) state.screen = fromHash.v;
  if (fromHash.d === 'phone' || fromHash.d === 'pc') state.device = fromHash.d;
  if (fromHash.p === 'light' || fromHash.p === 'dark') state.peek = fromHash.p;

  function effScheme() { return state.scheme === 'auto' ? state.peek : state.scheme; }

  /* ── 만들기 도우미 ─────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var inputs = {};   // axis → [input...]

  function option(axis, item, opts) {
    opts = opts || {};
    var label = el('label', 'opt' + (opts.cls ? ' ' + opts.cls : ''));
    var input = el('input', 'opt-input');
    input.type = 'radio';
    input.name = axis;
    input.value = item.id;
    input.addEventListener('change', function () { if (input.checked) set(axis, item.id); });
    (inputs[axis] = inputs[axis] || []).push(input);
    label.appendChild(input);
    var body = el('span', 'opt-body');
    var text = opts.wrap ? el('span', opts.wrap) : body;
    if (opts.before) text.appendChild(opts.before);
    var name = el('span', 'opt-name', opts.name || item.ko);
    var rec = el('span', 'opt-rec', '추천');
    rec.hidden = true;
    rec.setAttribute('data-rec', axis + ':' + item.id);
    name.appendChild(rec);
    text.appendChild(name);
    if (opts.say) text.appendChild(el('span', 'opt-say', opts.say));
    if (opts.fit) text.appendChild(el('span', 'opt-fit', opts.fit));
    if (opts.wrap) body.appendChild(text);
    if (opts.after) body.appendChild(opts.after);
    label.appendChild(body);
    return label;
  }

  // ① 화면 구조
  R.structures.forEach(function (s) {
    $('opts-structure').appendChild(option('structure', s, { say: s.say, fit: '이런 일에 맞음: ' + s.fit }));
  });

  // ② 스타일 — 추천 조합 7. 견본은 그 조합으로 골랐을 때의 모습(색은 아래 규칙대로)
  var samples = [];
  R.families.forEach(function (f) {
    var sample = el('span', 'combo-sample');
    sample.setAttribute('aria-hidden', 'true');
    var card = el('span', 'combo-card');
    card.appendChild(el('span', 'combo-title', '제목 가나다'));
    card.appendChild(el('span', 'combo-meta', '09-18 · 김○○'));
    card.appendChild(el('span', 'combo-btn', '저장'));
    sample.appendChild(card);
    samples.push({ id: f.id, node: sample, key: '' });
    $('opts-family').appendChild(option('family', f, { cls: 'combo', wrap: 'combo-text', say: f.say, after: sample }));
  });

  // ③ 색 — 바깥 칸은 그 색의 화면 바탕, 안쪽 칸은 강조색. 마지막 칸이 '내 색'
  var chips = [];
  R.palettes.concat([R.custom]).forEach(function (p) {
    var chip = el('span', 'sw-chip');
    chip.setAttribute('aria-hidden', 'true');
    var dot = el('span', 'sw-dot');
    chip.appendChild(dot);
    chips.push({ id: p.id, chip: chip, dot: dot });
    $('opts-palette').appendChild(option('palette', p, { cls: 'sw', before: chip }));
  });
  R.radii.forEach(function (s) { $('opts-radius').appendChild(option('radius', s)); });
  R.densities.forEach(function (s) { $('opts-density').appendChild(option('density', s)); });
  R.schemes.forEach(function (s) { $('opts-scheme').appendChild(option('scheme', s)); });

  // 미리 보기 — 화면·폭·(자동일 때) 밝게/어둡게
  R.screens.forEach(function (s) { $('opts-screen').appendChild(option('screen', s)); });
  DEVICES.forEach(function (d) { $('opts-device').appendChild(option('device', d)); });
  PEEKS.forEach(function (d) { $('opts-peek').appendChild(option('peek', d)); });

  /* ── 상태 바꾸기 ─────────────────────────────────────────── */
  function set(axis, id) {
    if (state[axis] === id && axis !== 'palette') return;
    if (axis === 'family') {
      state.family = id;
      if (!colorTouched) { var cc = R.comboColor(id); state.palette = cc.palette; state.seed = cc.seed; if (cc.palette === 'custom') customSeed = cc.seed; }
    } else if (axis === 'palette') {
      state.palette = id;
      state.seed = id === 'custom' ? customSeed : R.seedOf({ palette: id });
      colorTouched = true;
      if (id !== 'custom') hexError = '';
    } else {
      state[axis] = id;
    }
    if (axis !== 'screen' && axis !== 'device' && axis !== 'peek') userChanged = true;
    render();
    touch();
  }
  function setCustom(hex) {
    customSeed = hex;
    state.palette = 'custom';
    state.seed = hex;
    colorTouched = true;
    userChanged = true;
    render();
    touch();
  }

  function syncRadios() {
    Object.keys(inputs).forEach(function (axis) {
      inputs[axis].forEach(function (input) {
        var on = state[axis] === input.value;
        input.checked = on;
        input.parentNode.classList.toggle('is-on', on);
      });
    });
    $('opts-peek').hidden = state.scheme !== 'auto';
  }

  function setVars(node, list) {
    for (var i = 0; i < list.length; i++) node.style.setProperty(list[i][1], list[i][2]);
  }
  function paintSamples() {
    var sch = effScheme();
    samples.forEach(function (s) {
      var cc = R.comboColor(s.id);
      var sel = { family: s.id, palette: colorTouched ? state.palette : cc.palette, seed: colorTouched ? state.seed : cc.seed, radius: state.radius, density: state.density };
      var key = [sel.palette, sel.seed, sel.radius, sel.density, sch].join('|');
      if (s.key === key) return;
      s.key = key;
      setVars(s.node, R.tokens(sel, sch));
      s.node.setAttribute('data-scheme', sch);
    });
    chips.forEach(function (c) {
      var seed = c.id === 'custom' ? customSeed : R.seedOf({ palette: c.id });
      var col = R.colors({ family: state.family, palette: c.id === 'custom' ? 'custom' : c.id, seed: seed }, sch).c;
      c.chip.style.background = col.bg;
      c.dot.style.background = col.primary;
    });
  }

  /* 내 색 칸 — 색 칩·색 코드와 엔진이 바꾼 내용 */
  function paintCustom() {
    var box = $('pk-custom'), msg = $('pk-custom-msg'), hex = $('pk-hex'), color = $('pk-color');
    box.setAttribute('data-active', state.palette === 'custom' ? 'true' : 'false');
    if (document.activeElement !== hex) hex.value = customSeed;
    if (document.activeElement !== color) color.value = customSeed.toLowerCase();
    hex.setAttribute('aria-invalid', hexError ? 'true' : 'false');
    while (msg.firstChild) msg.removeChild(msg.firstChild);
    if (hexError) { var w = el('li', 'is-warn', hexError); msg.appendChild(w); return; }
    if (state.palette !== 'custom') return;
    var schemes = state.scheme === 'auto' ? ['light', 'dark'] : [state.scheme];
    schemes.forEach(function (sch) {
      var r = R.colors(state, sch), n = r.notes, c = r.c;
      var nm = sch === 'dark' ? '어둡게' : '밝게';
      if (n.nearWhite) msg.appendChild(el('li', null, nm + ': 넣으신 색이 바탕과 거의 같아 버튼이 묻힙니다. 같은 계열의 진한 색 ' + c.primary + ' 로 바꿨습니다(보정됨).'));
      else if (n.fillMoved) msg.appendChild(el('li', null, nm + ': 버튼 위 글자가 읽히도록 버튼 색을 ' + n.seed + ' 에서 ' + c.primary + ' 로 ' + (sch === 'dark' ? '밝게' : '진하게') + ' 바꿨습니다(보정됨).'));
      else msg.appendChild(el('li', null, nm + ': 버튼 색은 넣으신 색 그대로입니다(버튼 글자는 ' + (n.on === 'white' ? '흰색' : '진한 색') + ').'));
      if (n.textMoved) msg.appendChild(el('li', null, nm + ': 바탕 위 강조 글자·선택 표시는 읽히도록 ' + c['primary-text'] + ' 로 씁니다.'));
    });
  }

  /* 이걸로 하기 — 색 코드가 틀렸거나 대비 자가 검사를 통과하지 못하면 막고 이유를 보인다 */
  function blockReason() {
    if (state.palette === 'custom' && hexError) return '내 색의 색 코드를 고쳐야 저장할 수 있습니다 — # 다음에 여섯 자리(예: #2A6F9E).';
    var chk = R.selfCheck(state);
    if (!chk.ok) return '글자가 잘 읽히는지 검사에서 걸렸습니다(' + chk.fails.slice(0, 2).join(', ') + '). 다른 색을 골라 주세요.';
    return '';
  }

  function previewUrl() {
    var rel = 'src/' + state.structure + '.html#c=' + code() + '&s=' + state.screen + (state.scheme === 'auto' ? '&p=' + state.peek : '');
    try { return new URL(rel, location.href).href; } catch (e) { return rel; }
  }

  function updatePreview() {
    var pv = $('pv');
    var url = previewUrl();
    if (loadedStructure !== state.structure) {
      loadedStructure = state.structure;
      mockHeight = null;
      pv.src = url;
    } else {
      // 같은 목업 파일 안에서 주소 끝(#)만 바꾼다 — 다시 읽지 않고 토큰·화면만 바뀐다
      try { pv.contentWindow.location.replace(url); } catch (e) { pv.src = url; }
    }
    layoutPreview();
  }

  function layoutPreview() {
    var d = R.byId(DEVICES, state.device);
    var stage = $('pv-stage'), frame = $('pv-frame'), pv = $('pv');
    var cs = window.getComputedStyle(stage);
    var avail = stage.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var scale = Math.min(1, Math.max(0.1, avail / d.w));
    var h = Math.max(mockHeight || d.h, d.id === 'phone' ? 560 : 520);
    pv.style.width = d.w + 'px';
    pv.style.height = h + 'px';
    pv.style.transform = 'scale(' + scale + ')';
    frame.style.width = Math.floor(d.w * scale) + 'px';
    frame.style.height = Math.ceil(h * scale) + 'px';
    frame.setAttribute('data-device', d.id);
  }

  function showRecommend(rec) {
    var nodes = document.querySelectorAll('[data-rec]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-rec').split(':');
      nodes[i].hidden = !(rec && rec[k[0]] === k[1]);
    }
  }

  function render(skipPreview) {
    syncRadios();
    paintSamples();
    paintCustom();
    $('sum-text').textContent = R.label(state);
    $('sum-code').textContent = code();
    var why = blockReason(), go = $('pk-go'), block = $('pk-block');
    if (!saved) {
      go.disabled = !!why;
      block.hidden = !why;
      block.textContent = why;
    }
    writeHash();
    if (!skipPreview) updatePreview();
  }

  /* 내 색 — 색 칩을 움직이거나 색 코드를 적으면 바로 바뀐다 */
  $('pk-color').addEventListener('input', function () {
    var h = E.normHex(this.value);
    if (!h) return;
    hexError = '';
    $('pk-hex').value = h;
    setCustom(h);
  });
  $('pk-hex').addEventListener('input', function () {
    var raw = String(this.value || '').trim();
    var h = /^#?[0-9a-fA-F]{6}$/.test(raw) ? E.normHex(raw) : null;
    if (h) { hexError = ''; setCustom(h); return; }
    hexError = raw ? '색 코드를 읽지 못했습니다. # 다음에 숫자·영문(A~F) 여섯 자리로 적어 주세요(예: #2A6F9E).' : '색 코드가 비어 있습니다. 예: #2A6F9E';
    state.palette = 'custom';
    colorTouched = true;
    render(true);
  });
  $('pk-hex').addEventListener('blur', function () { if (!hexError) this.value = customSeed; });
  $('pk-reset-color').addEventListener('click', function () {
    var cc = R.comboColor(state.family);
    state.palette = cc.palette;
    state.seed = cc.seed;
    if (cc.palette === 'custom') customSeed = cc.seed;
    colorTouched = false;
    hexError = '';
    userChanged = true;
    render();
    touch();
  });

  /* ── 미리 보기가 보내는 높이·화면 이름 받기 ───────────────── */
  window.addEventListener('message', function (e) {
    var pv = $('pv');
    if (!pv || e.source !== pv.contentWindow) return;
    var d = e.data || {};
    if (d.kind !== 'erp-mock') return;
    if (typeof d.height === 'number' && d.height > 0 && d.height < 20000 && d.height !== mockHeight) {
      mockHeight = d.height;
      layoutPreview();
    }
    if (d.screen && d.screen !== state.screen && R.byId(R.screens, d.screen)) {
      state.screen = d.screen;
      syncRadios();
      writeHash();
    }
  });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutPreview, 80);
  });
  if (darkMq && darkMq.addEventListener) {
    darkMq.addEventListener('change', function (ev) { if (!userChanged || state.scheme === 'auto') { state.peek = ev.matches ? 'dark' : 'light'; render(); } });
  }

  /* ── 열린 방법(서버/파일)과 안내 문구 ─────────────────────── */
  function setMode(mode) {
    var box = $('pk-mode');
    box.setAttribute('data-mode', mode);
    if (mode === 'server') box.textContent = 'AI 가 열어 둔 선택창입니다. 다 고르면 맨 아래 \'이걸로 하기\'를 누르세요. 고른 내용이 바로 저장됩니다.';
    else if (mode === 'lost') box.textContent = '선택창과 AI 쪽 연결이 끊겼습니다. 계속 고르셔도 됩니다. \'이걸로 하기\'를 누르면 조합 코드가 나옵니다. 그 코드를 AI 에게 말하세요.';
    else box.textContent = '파일로 연 선택창입니다(저장 기능 없음). 다 고르면 \'이걸로 하기\'를 누르고, 나오는 조합 코드를 AI 에게 말하세요.';
  }

  function api(path, method, body) {
    var o = { method: method || 'GET', cache: 'no-store', headers: {} };
    if (server.token) o.headers['X-Pick-Token'] = server.token;
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d || {} }; });
    });
  }

  function heartbeat() {
    if (!server.on || server.lost || saved) return;
    api('/ping').then(function (r) {
      if (!r.ok) throw new Error('ping');
      server.fails = 0;
    }).catch(function () {
      server.fails += 1;
      if (server.fails >= 2) { server.lost = true; setMode('lost'); }
    });
  }

  // 대표가 고르고 있다는 신호 — 서버의 '30분 무응답' 시계를 다시 맞춘다(20초에 한 번까지만)
  function touch() {
    if (!server.on || server.lost || saved) return;
    var now = Date.now();
    if (now - server.lastTouch < 20000) return;
    server.lastTouch = now;
    api('/touch', 'POST', {}).catch(function () { /* 다음 ping 이 판단한다 */ });
  }

  // 추천 — 서버가 준 칸만 맞춘다(구조 · 스타일 · 색 · 밝기). 색을 추천받았으면 스타일을 바꿔도 그 색을 지킨다
  function applyRecommend(rec) {
    if (!rec || hashSel || userChanged) return;
    if (rec.structure && R.byId(R.structures, rec.structure)) state.structure = rec.structure;
    if (rec.family && R.byId(R.families, rec.family)) {
      state.family = rec.family;
      var cc = R.comboColor(rec.family);
      state.palette = cc.palette; state.seed = cc.seed;
      if (cc.palette === 'custom') customSeed = cc.seed;
    }
    if (rec.palette === 'custom' && E.normHex(rec.seed)) { state.palette = 'custom'; state.seed = E.normHex(rec.seed); customSeed = state.seed; colorTouched = true; }
    else if (rec.palette && R.byId(R.palettes, rec.palette)) { state.palette = rec.palette; state.seed = R.seedOf({ palette: rec.palette }); colorTouched = true; }
    if (rec.scheme && R.byId(R.schemes, rec.scheme)) state.scheme = rec.scheme;
  }

  function detectServer() {
    if (location.protocol !== 'http:') { setMode('file'); return; }
    api('/api/state').then(function (r) {
      if (!r.ok || r.data.app !== 'erp-design-pick' || !r.data.token) throw new Error('not picker');
      server.on = true;
      server.token = r.data.token;
      recommend = r.data.recommend || null;
      applyRecommend(recommend);
      showRecommend(recommend);
      setMode('server');
      server.timer = setInterval(heartbeat, 15000);
      render();
    }).catch(function () { setMode('file'); render(); });
  }

  /* ── 이걸로 하기 ─────────────────────────────────────────── */
  function resultBox() {
    var box = $('pk-result');
    while (box.firstChild) box.removeChild(box.firstChild);
    box.hidden = false;
    return box;
  }
  // 결과 칸을 화면 가운데로 바로 옮긴다(아래 고정 줄에 가리지 않게, 움직임 없이)
  function focusResult(box) {
    try { box.scrollIntoView({ block: 'center' }); } catch (e) { box.scrollIntoView(); }
    try { box.focus({ preventScroll: true }); } catch (e2) { box.focus(); }
  }

  function copyText(text, btn) {
    function done(ok) { btn.textContent = ok ? '복사했습니다' : '복사하지 못했습니다 — 위 글자를 그대로 옮겨 적어 주세요'; }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback()); });
    } else {
      done(fallback());
    }
  }

  function showCode(why) {
    var c = code();
    var box = resultBox();
    box.appendChild(el('h2', null, 'AI 에게 이 코드를 말하세요'));
    if (why) box.appendChild(el('p', null, why));
    box.appendChild(el('p', null, R.label(state)));
    box.appendChild(el('code', 'pk-code', c));
    var btn = el('button', 'pk-btn', '코드 복사');
    btn.type = 'button';
    btn.addEventListener('click', function () { copyText(c, btn); });
    box.appendChild(btn);
    box.appendChild(el('p', null, '채팅 창에 "디자인은 ' + c + ' 로 할게요"라고 적으면 됩니다. 다른 조합이 마음에 들면 위에서 다시 고르고 버튼을 또 누르셔도 됩니다.'));
    focusResult(box);
  }

  function showSaved(d) {
    saved = true;
    if (server.timer) clearInterval(server.timer);
    var box = resultBox();
    box.appendChild(el('h2', null, '저장됐습니다 — AI 가 이어서 진행합니다. 대화가 멈춰 있으면 \'골랐어요\'라고 말하세요'));
    box.appendChild(el('p', null, (d.label || R.label(state)) + ' (' + (d.code || code()) + ')'));
    if (d.files && d.files.length) {
      box.appendChild(el('p', null, '만든 파일:'));
      var ul = el('ul', 'pk-files');
      d.files.forEach(function (f) { ul.appendChild(el('li', null, f)); });
      box.appendChild(ul);
    }
    box.appendChild(el('p', null, '선택창은 닫혔습니다. 이 창은 닫으셔도 됩니다. 나중에 다시 고르려면 AI 에게 "디자인 다시 고르기"라고 말하세요.'));
    var go = $('pk-go');
    go.disabled = true;
    go.textContent = '저장됨';
    $('pk-block').hidden = true;
    $('pk-mode').textContent = '저장됐습니다. AI 가 이어서 진행합니다(멈춰 있으면 \'골랐어요\').';
    focusResult(box);
  }

  $('pk-go').addEventListener('click', function () {
    if (saved) return;
    var why = blockReason();
    if (why) { $('pk-block').hidden = false; $('pk-block').textContent = why; return; }
    if (!server.on || server.lost) { showCode(server.lost ? '선택창과 AI 쪽 연결이 끊겨 바로 저장하지 못했습니다.' : ''); return; }
    var go = $('pk-go');
    go.disabled = true;
    go.textContent = '저장하는 중…';
    api('/choose', 'POST', {
      structure: state.structure, family: state.family, palette: state.palette, seed: state.palette === 'custom' ? state.seed : null,
      scheme: state.scheme, radius: state.radius, density: state.density
    })
      .then(function (r) {
        if (!r.ok || !r.data.ok) throw new Error(r.data.error || ('응답 ' + r.status));
        showSaved(r.data);
      })
      .catch(function (err) {
        go.disabled = false;
        go.textContent = '이걸로 하기';
        server.lost = true;
        setMode('lost');
        // 연결이 끊긴 경우(브라우저가 영어 오류를 낸다)는 우리말로 바꿔 보여 준다. 서버가 보낸 이유는 이미 우리말이다.
        var w = (!err || err.name === 'TypeError' || !err.message) ? '선택창과 AI 쪽 연결이 끊겼습니다' : err.message;
        showCode('바로 저장하지 못했습니다 — ' + w + '.');
      });
  });

  // 기본값이 아닌 세부 조절이 있으면(주소 끝에서 되살린 경우 등) 세부 조절을 열어 둔다
  if (state.radius !== 'base' || state.density !== 'base' || state.scheme !== R.defaults.scheme || state.palette === 'custom' && state.family !== 'indeans') {
    $('pk-more').open = true;
  }

  // 서버로 열렸으면 추천을 받은 뒤에 미리 보기를 한 번만 읽는다(먼저 읽던 목업을 버리지 않게)
  render(location.protocol === 'http:');
  showRecommend(null);
  detectServer();
}());

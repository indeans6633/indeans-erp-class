/* 목업 미리 보기 도우미 — 미리 보기 전용. 초안(앱)에는 가져가지 않는다(목업의 클래스·배치만 이어받는다).
 *
 * 선택창(index.html)이 목업 주소 끝(#)에 고른 조합과 화면 이름을 실어 보낸다.
 *   예) list.html#c=list-soft-teal-auto&s=today&p=dark
 *   c = 조합 코드 → 색 엔진(color-engine.js)과 규칙(design-rules.js)으로 토큰을 계산해 <style id="tokens"> 에 넣는다
 *       (미리 만든 토큰 파일은 없다 — '내 색'처럼 아무 색이나 받을 수 있게 그 자리에서 계산한다)
 *   s = list | detail | today → 그 화면만 보이게 한다
 *   p = light | dark → 밝기 자동(auto)일 때 미리 보기에 어느 쪽을 보일지(<html data-theme>)
 * 목업 파일을 직접 열어도(주소 끝이 비어 있어도) 기본 조합·목록 화면으로 보인다.
 * 글꼴은 ../fonts/ 의 파일을 쓴다(인터넷에서 받지 않는다).
 * 바깥 주소로는 아무것도 보내지 않는다. 선택창에 보내는 것은 화면 높이와 지금 화면 이름뿐이다.
 * 이 파일은 <head> 안, 두 규칙 파일 바로 다음·base.css 앞에 둔다 — 첫 그림부터 고른 토큰으로 그리기 위해서다.
 * 아래에서 올라오는 시트(<dialog class="sheet">) 여닫기와 보드 열 탭 이동도 여기서 흉내만 낸다(앱은 앱 코드로 만든다).
 */
(function () {
  'use strict';
  var R = window.ERP_DESIGN;
  var SCREENS = ['list', 'detail', 'today'];
  var current = 'list';
  var lastCss = '';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 토큰 자리 — 지금 위치(규칙 파일 뒤, base.css 앞)에 둔다
  var style = document.createElement('style');
  style.id = 'tokens';
  (document.head || document.documentElement).appendChild(style);

  function readHash() {
    var out = {};
    var raw = String(location.hash || '').replace(/^#/, '');
    if (!raw) return out;
    raw.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i <= 0) return;
      try { out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 깨진 값은 건너뛴다 */ }
    });
    return out;
  }
  function writeHash(p) {
    var parts = [];
    if (p.c) parts.push('c=' + encodeURIComponent(p.c));
    if (p.s) parts.push('s=' + encodeURIComponent(p.s));
    if (p.p) parts.push('p=' + encodeURIComponent(p.p));
    location.hash = parts.join('&');
  }

  function applyTokens(p) {
    if (!R) return;
    var sel = (p.c && R.parseCode(p.c)) || R.normalize({ structure: 'list' });
    var css = '';
    try { css = R.tokenCss(sel, { fontBase: '../fonts/' }); } catch (e) { css = ''; }
    if (css && css !== lastCss) { style.textContent = css; lastCss = css; }
    var root = document.documentElement;
    if (sel.scheme === 'auto' && (p.p === 'light' || p.p === 'dark')) root.setAttribute('data-theme', p.p);
    else root.removeAttribute('data-theme');
  }

  function showScreen(s) {
    current = SCREENS.indexOf(s) >= 0 ? s : 'list';
    var mains = document.querySelectorAll('[data-screen]');
    for (var i = 0; i < mains.length; i++) mains[i].hidden = mains[i].getAttribute('data-screen') !== current;
    var links = document.querySelectorAll('nav [data-go]');
    for (var j = 0; j < links.length; j++) {
      var go = links[j].getAttribute('data-go');
      var on = current === 'today' ? go === 'today' : go === 'list';
      if (on) links[j].setAttribute('aria-current', 'page'); else links[j].removeAttribute('aria-current');
    }
  }

  // 내용이 끝나는 높이 — 문서 높이(scrollHeight)는 미리 보기 창 높이보다 작아지지 않아서
  // 긴 화면을 보다가 짧은 화면으로 바꾸면 줄어들지 않는다. 보이는 화면의 내용 끝을 잰다.
  function contentHeight() {
    var main = document.querySelector('[data-screen]:not([hidden])');
    if (!main) return Math.ceil(document.documentElement.scrollHeight);
    var bottom = 0, kids = main.children;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (r.bottom > bottom) bottom = r.bottom;
    }
    var pad = parseFloat(window.getComputedStyle(main).paddingBottom) || 0;
    return Math.ceil(bottom + pad + (window.scrollY || 0));
  }

  function report() {
    if (!window.parent || window.parent === window || !document.body) return;
    try { window.parent.postMessage({ kind: 'erp-mock', screen: current, height: contentHeight() }, '*'); } catch (e) { /* 미리 보기 밖이면 무시 */ }
  }

  function apply() {
    var p = readHash();
    applyTokens(p);
    showScreen(p.s);
    report();
  }

  /* ── 아래에서 올라오는 시트 ─────────────────────────────── */
  function openSheet(id) {
    var d = document.getElementById(id);
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function closeSheet(d) {
    if (!d) return;
    d.style.transform = '';
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }
  // 잡는 막대·머리를 아래로 80px 넘게 끌면 닫는다
  function dragToClose(d) {
    var startY = null, dy = 0, handle = d.querySelector('.sheet-head');
    var grip = d.querySelector('.sheet-grip');
    [handle, grip].forEach(function (h) {
      if (!h) return;
      h.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button')) return;
        startY = e.clientY; dy = 0;
        try { h.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
      });
      h.addEventListener('pointermove', function (e) {
        if (startY === null) return;
        dy = Math.max(0, e.clientY - startY);
        d.style.transform = dy ? 'translateY(' + dy + 'px)' : '';
      });
      var end = function () {
        if (startY === null) return;
        startY = null;
        if (dy > 80) closeSheet(d); else d.style.transform = '';
      };
      h.addEventListener('pointerup', end);
      h.addEventListener('pointercancel', end);
    });
  }

  /* ── 보드 열 탭(폰) ─────────────────────────────────────── */
  function markCol(id) {
    var tabs = document.querySelectorAll('[data-col]');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-col') === id) tabs[i].setAttribute('aria-current', 'true');
      else tabs[i].removeAttribute('aria-current');
    }
  }
  function goCol(id) {
    var col = document.getElementById(id);
    var board = col && col.parentNode;
    if (!board) return;
    var pad = parseFloat(window.getComputedStyle(board).paddingLeft) || 0;
    var left = col.offsetLeft - board.offsetLeft - pad;
    try { board.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { board.scrollLeft = left; }
    markCol(id);
  }
  function watchBoard() {
    var board = document.querySelector('.board');
    if (!board) return;
    var t = null;
    board.addEventListener('scroll', function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        var cols = board.querySelectorAll('.column[id]'), best = null, bestD = Infinity;
        var b = board.getBoundingClientRect();
        for (var i = 0; i < cols.length; i++) {
          var d = Math.abs(cols[i].getBoundingClientRect().left - b.left);
          if (d < bestD) { bestD = d; best = cols[i].id; }
        }
        if (best) markCol(best);
      }, 80);
    });
  }

  // 처음 읽을 때 — 본문이 그려지기 전에 토큰부터 맞춘다
  var first = readHash();
  applyTokens(first);

  document.addEventListener('DOMContentLoaded', function () {
    showScreen(first.s);
    var sheets = document.querySelectorAll('dialog.sheet');
    for (var i = 0; i < sheets.length; i++) dragToClose(sheets[i]);
    watchBoard();
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var opener = t.closest('[data-sheet]');
      if (opener) { e.preventDefault(); openSheet(opener.getAttribute('data-sheet')); return; }
      var closer = t.closest('[data-close]');
      if (closer) { e.preventDefault(); closeSheet(closer.closest('dialog')); return; }
      // 시트 바깥(어두운 가림막)을 누르면 닫는다 — 가림막을 누르면 dialog 자신이 눌린 것으로 온다
      if (t.tagName === 'DIALOG' && t.classList.contains('sheet')) {
        var r = t.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) closeSheet(t);
        return;
      }
      var col = t.closest('[data-col]');
      if (col) { e.preventDefault(); goCol(col.getAttribute('data-col')); return; }
      // 목업 안의 링크(메뉴·건 이름·돌아가기)는 화면만 바꾼다
      var a = t.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      var go = a.getAttribute('data-go');
      if (SCREENS.indexOf(go) < 0) return;
      var p = readHash();
      p.s = go;
      writeHash(p);
    });
    // 목업의 폼은 아무 데도 보내지 않는다
    document.addEventListener('submit', function (e) { e.preventDefault(); });
    report();
  });
  window.addEventListener('hashchange', apply);
  window.addEventListener('load', report);
  window.addEventListener('resize', report);
  // 글꼴이 늦게 읽히면 줄 높이가 바뀐다 — 다 읽힌 뒤 높이를 다시 알린다
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(report, function () { /* 무시 */ });
}());

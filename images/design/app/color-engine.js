/* 인디언즈 ERP 클래스 — 색 엔진 (의존성 없음)
 *
 * 색 하나(시드)를 받아 밝게·어둡게 두 벌의 화면 색을 만든다.
 * 색상(hue)·채도(chroma)는 그대로 두고 명도(lightness)만 움직여, 목표 대비를 처음 넘는 지점을 찾는다.
 * (목표 대비에서 명도를 거꾸로 찾는 "방식"은 Leonardo·Radix 색 생성기·Material Color Utilities 를 참고했고,
 *  코드는 직접 썼다.)
 *
 * 이 파일 하나를 세 곳이 같이 읽는다 — 대비를 재는 함수(ratio)도 이 하나만 쓴다.
 *   선택창(index.html)·목업(src/*.html) ....... 브라우저 <script src> → window.ERP_COLOR
 *   선택창 서버(.owner/hooks/design-pick.mjs) .. Node vm
 *   제작 점검(scripts/build-design-tokens.mjs) .. Node vm
 * 파일을 두 번 눌러 여는 file:// 에서도 돌아야 해서 import/export(모듈) 문법을 쓰지 않는다.
 *
 * 대비: WCAG 2.2 상대 휘도 공식(임계 0.04045) — 반올림하지 않고 비교한다(4.499 는 불합격).
 * 색 공간: OKLab/OKLCH. 변환 행렬은 Björn Ottosson(2020)의 공개 도메인 값이다 — THIRD-PARTY-NOTICES.md
 *
 * 만드는 색(derive 의 결과)
 *   면     bg · surface · surface-2 · border(줄 사이 괘선 — 장식)
 *   선     border-strong · border-input — 바탕 3종(bg·surface·surface-2) 대비 3:1 이상(WCAG 1.4.11)
 *   글자   text · text-2 · text-3 · ok · warn · danger · primary-text — 바탕 4종(+primary-soft) 대비 4.5:1 이상
 *   강조   primary(버튼 면 — 넣은 색을 되도록 그대로) · primary-on(그 위 글자 4.5:1) · primary-hover · primary-soft
 */
(function (root) {
  'use strict';

  var WHITE = '#FFFFFF';
  var STEP = 0.005;

  /* ── sRGB ↔ 선형 ─────────────────────────────────────────── */
  function dec(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function enc(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

  /* '#abc'·'abc'·'#AABBCC'·'aabbcc' → '#AABBCC'. 읽지 못하면 null */
  function normHex(s) {
    var m = String(s == null ? '' : s).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(m)) m = m.charAt(0) + m.charAt(0) + m.charAt(1) + m.charAt(1) + m.charAt(2) + m.charAt(2);
    return /^[0-9a-fA-F]{6}$/.test(m) ? '#' + m.toUpperCase() : null;
  }
  function rgb(hex) {
    var h = normHex(hex);
    if (!h) throw new Error('색 값(#RRGGBB)이 아닙니다: ' + hex);
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }
  function hexOf(c) {
    var out = '#', i, n;
    for (i = 0; i < 3; i++) {
      n = Math.round(Math.min(1, Math.max(0, c[i])) * 255);
      out += (n < 16 ? '0' : '') + n.toString(16);
    }
    return out.toUpperCase();
  }

  /* ── WCAG 2.2 대비 ────────────────────────────────────────── */
  function lum(hex) {
    var c = rgb(hex).map(dec);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function minRatio(fg, grounds) {
    var m = Infinity, i;
    for (i = 0; i < grounds.length; i++) m = Math.min(m, ratio(fg, grounds[i]));
    return m;
  }

  /* ── OKLCH ───────────────────────────────────────────────── */
  function toOklch(hex) {
    var c = rgb(hex).map(dec), r = c[0], g = c[1], b = c[2];
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var H = Math.atan2(B, A) * 180 / Math.PI;
    if (H < 0) H += 360;
    return [L, Math.sqrt(A * A + B * B), H];
  }
  function linOf(L, C, H) {
    var a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function inGamut(c) { return c[0] >= -1e-6 && c[0] <= 1 + 1e-6 && c[1] >= -1e-6 && c[1] <= 1 + 1e-6 && c[2] >= -1e-6 && c[2] <= 1 + 1e-6; }
  /* 명도·색상은 지키고, 화면에 낼 수 없는 색이면 채도만 줄인 뒤 #RRGGBB 로 */
  function fromOklch(L, C, H) {
    L = Math.min(1, Math.max(0, L));
    if (!(C > 0)) C = 0;
    if (!inGamut(linOf(L, C, H))) {
      var lo = 0, hi = C, i, mid;
      for (i = 0; i < 24; i++) { mid = (lo + hi) / 2; if (inGamut(linOf(L, mid, H))) lo = mid; else hi = mid; }
      C = lo;
    }
    return hexOf(linOf(L, C, H).map(enc));
  }
  /* OKLab 거리 — 두 색이 눈에 얼마나 달라 보이는지(0.1 미만이면 거의 같은 색) */
  function deltaE(a, b) {
    var p = toOklch(a), q = toOklch(b);
    var pa = p[1] * Math.cos(p[2] * Math.PI / 180), pb = p[1] * Math.sin(p[2] * Math.PI / 180);
    var qa = q[1] * Math.cos(q[2] * Math.PI / 180), qb = q[1] * Math.sin(q[2] * Math.PI / 180);
    return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (pa - qa) * (pa - qa) + (pb - qb) * (pb - qb));
  }

  /* ── 명도 찾기 ───────────────────────────────────────────── */
  /* startL 에서 dir 쪽(-1 어둡게 / +1 밝게)으로 조금씩 옮겨, grounds 모두에서 target 을 처음 넘는 색 */
  function solveL(startL, C, H, grounds, target, dir) {
    var L = startL, k, hx;
    for (k = 0; k < 220; k++) {
      hx = fromOklch(L, C, H);
      if (minRatio(hx, grounds) >= target) return hx;
      L += dir * STEP;
      if (L < -STEP || L > 1 + STEP) break;
    }
    return dir < 0 ? '#000000' : WHITE;
  }
  /* 이미 통과하면 그대로, 아니면 그 색의 색상·채도를 지킨 채 명도만 옮긴다 */
  function fix(hex, grounds, target, dir) {
    var h = normHex(hex);
    if (minRatio(h, grounds) >= target) return h;
    var o = toOklch(h);
    return solveL(o[0], o[1], o[2], grounds, target, dir);
  }

  /* ── 도우미 ─────────────────────────────────────────────── */
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b);
    return hexOf([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
  }
  function rgba(hex, a) {
    var c = rgb(hex);
    return 'rgba(' + Math.round(c[0] * 255) + ', ' + Math.round(c[1] * 255) + ', ' + Math.round(c[2] * 255) + ', ' + a + ')';
  }

  /* ── 기본 명도표(시드로 옅게 물들인 무채색) ─────────────────── */
  var LEVELS = {
    light: { bg: 0.975, surface: 1, surface2: 0.95, border: 0.9, soft: 0.95, text: 0.2, text2: 0.5, text3: 0.54, input: 0.8 },
    dark: { bg: 0.17, surface: 0.205, surface2: 0.245, border: 0.32, soft: 0.28, text: 0.93, text2: 0.7, text3: 0.66, input: 0.42 }
  };
  /* 뜻이 있는 색의 출발점 — 바탕에 맞춰 명도만 옮긴다 */
  var SEM = {
    light: { ok: '#1F6B45', warn: '#8A6100', danger: '#A32821' },
    dark: { ok: '#7BCC98', warn: '#E8BE62', danger: '#F08F87' }
  };

  /* derive(seed, scheme, profile) → { c: 색 이름표, notes: 보정 기록 }
   * profile = { light: {...}, dark: {...}, semSeed: { ok, warn, danger } }
   *   각 밝기 칸(모두 생략 가능): bg·surface·surface2·border·soft·text·text2·text3·input·strong
   *     값이 '#RRGGBB' 면 그 색에서 출발(통과하면 그대로), 숫자면 OKLCH 명도(시드로 옅게 물들임)
   *     input·strong 은 'text' 도 된다(글자색과 같은 선 — 선명한 대비)
   *   strongRatio  border-strong 의 목표 대비(기본 3)
   *   tintHue·tintChroma  무채색을 물들일 색상·채도(기본: 시드 색상, 채도 = min(시드 채도 × 0.08, 0.012))
   *   softMix: ['#RRGGBB', t]  계산한 primary-soft 를 그 색 쪽으로 t 만큼 섞는다(종이 바탕 등)
   *   softFixed: { seed: '#RRGGBB', hex: '#RRGGBB' }  시드가 같을 때만 primary-soft 를 그 값으로 둔다
   *   semSeed(밝기 칸 밖)  뜻이 있는 색의 출발 시드 — 밝게는 그대로, 어둡게는 명도 0.75 에서 출발 */
  function derive(seedIn, scheme, profile) {
    var seed = normHex(seedIn);
    if (!seed) throw new Error('색 값(#RRGGBB)이 아닙니다: ' + seedIn);
    var dark = scheme === 'dark';
    var prof = profile || {};
    var p = (dark ? prof.dark : prof.light) || {};
    var D = dark ? LEVELS.dark : LEVELS.light;
    var s = toOklch(seed), sL = s[0], sC = s[1], H = s[2];
    var tH = p.tintHue != null ? p.tintHue : H;
    var tC = p.tintChroma != null ? p.tintChroma : Math.min(sC * 0.08, 0.012);
    var dir = dark ? 1 : -1;
    var c = {}, notes = { seed: seed, scheme: dark ? 'dark' : 'light' };

    function start(v, defL) {
      if (typeof v === 'string' && v !== 'text') return normHex(v);
      return fromOklch(typeof v === 'number' ? v : defL, tC, tH);
    }

    // 면
    c.bg = start(p.bg, D.bg);
    c.surface = start(p.surface, D.surface);
    c['surface-2'] = start(p.surface2, D.surface2);
    c.border = start(p.border, D.border);
    if (p.softFixed && normHex(p.softFixed.seed) === seed) c['primary-soft'] = normHex(p.softFixed.hex);
    else {
      var softL = typeof p.soft === 'number' ? p.soft : (typeof p.soft === 'string' ? toOklch(p.soft)[0] : D.soft);
      c['primary-soft'] = fromOklch(softL, Math.min(sC * (dark ? 0.35 : 0.3), dark ? 0.05 : 0.035), H);
      if (p.softMix) c['primary-soft'] = mix(c['primary-soft'], p.softMix[0], p.softMix[1]);
    }
    var G = [c.bg, c.surface, c['surface-2'], c['primary-soft']];
    var NT = [c.bg, c.surface, c['surface-2']];

    // 글자
    c.text = fix(start(p.text, D.text), G, 4.5, dir);
    c['text-2'] = fix(start(p.text2, D.text2), G, 4.5, dir);
    c['text-3'] = fix(start(p.text3, D.text3), G, 4.5, dir);
    ['ok', 'warn', 'danger'].forEach(function (k) {
      var from = SEM[dark ? 'dark' : 'light'][k];
      if (prof.semSeed && prof.semSeed[k]) {
        from = normHex(prof.semSeed[k]);
        if (dark) { var o = toOklch(from); from = fromOklch(Math.max(o[0], 0.75), o[1], o[2]); }
      }
      c[k] = fix(from, G, 4.5, dir);
    });

    // 선 — 입력 칸·보조 버튼 테두리, 구역 구분선(3:1)
    c['border-input'] = p.input === 'text' ? c.text : fix(start(p.input, D.input), NT, 3, dir);
    if (p.strong === 'text') c['border-strong'] = c.text;
    else if (p.strong != null || p.strongRatio) c['border-strong'] = fix(start(p.strong, D.input), NT, p.strongRatio || 3, dir);
    else c['border-strong'] = c['border-input'];

    // 강조 — 버튼 면은 넣은 색을 되도록 그대로(그 위 글자를 흰색·진한 색 중 4.5:1 되는 쪽으로)
    var ink = fromOklch(0.18, Math.min(sC * 0.3, 0.04), H);
    var fill;
    notes.nearWhite = false;
    if (!dark) {
      if (deltaE(seed, c.surface) < 0.1 || deltaE(seed, c.bg) < 0.1) {
        // 흰색에 가까운 색 — 버튼이 바탕에 묻힌다. 같은 색상에서 흰 글자가 읽힐 때까지 진하게
        notes.nearWhite = true;
        fill = solveL(Math.min(sL, 0.95), sC, H, [WHITE], 4.5, -1);
      } else if (Math.max(ratio(WHITE, seed), ratio(ink, seed)) >= 4.5) {
        fill = seed;
      } else {
        fill = solveL(sL, sC, H, [WHITE], 4.5, -1);
      }
    } else if (sL >= 0.7 && ratio(ink, seed) >= 4.5) {
      fill = seed;
    } else {
      // 어둡게 — 강조색을 밝은 톤으로 올리고 그 위 글자를 진한 색으로 뒤집는다
      fill = solveL(Math.max(sL, 0.7), sC, H, [ink], 4.5, 1);
    }
    c.primary = fill;
    c['primary-on'] = ratio(WHITE, fill) >= ratio(ink, fill) ? WHITE : ink;

    // 바탕 위 강조 글자·선택 표시선·포커스 테두리 — 바탕 4종 모두에서 4.5:1
    var txt;
    if (!dark) txt = minRatio(seed, G) >= 4.5 ? seed : solveL(Math.min(sL, 0.55), sC, H, G, 4.5, -1);
    else txt = (sL >= 0.7 && minRatio(seed, G) >= 4.5) ? seed : solveL(Math.max(sL, 0.7), sC, H, G, 4.5, 1);
    c['primary-text'] = txt;

    // 마우스를 올렸을 때 — 그 위 글자에서 멀어지는 쪽으로 옮겨 글자 대비가 떨어지지 않게
    // (검정·흰색처럼 그쪽으로 더 옮길 곳이 없으면 반대쪽으로 — 눈에 보일 만큼(면끼리 1.1 이상) 다르고 글자 대비 4.5:1 안에서만)
    var pl = toOklch(fill), on = c['primary-on'];
    var away = ratio(on, fromOklch(pl[0] - 0.05, pl[1], pl[2])) >= ratio(on, fromOklch(pl[0] + 0.05, pl[1], pl[2])) ? -1 : 1;
    function hoverToward(d) {
      for (var st = 1; st <= 6; st++) {
        var cand = fromOklch(pl[0] + d * st * 0.05, pl[1], pl[2]);
        if (ratio(cand, fill) >= 1.1 && ratio(on, cand) >= 4.5) return cand;
      }
      return null;
    }
    c['primary-hover'] = hoverToward(away) || hoverToward(-away) || fill;

    notes.fill = fill;
    notes.fillMoved = fill !== seed;
    notes.text = txt;
    notes.textMoved = txt !== seed;
    notes.on = c['primary-on'] === WHITE ? 'white' : 'ink';
    return { c: c, notes: notes };
  }

  var api = {
    version: 1,
    normHex: normHex,
    lum: lum,
    ratio: ratio,
    minRatio: minRatio,
    toOklch: toOklch,
    fromOklch: fromOklch,
    deltaE: deltaE,
    solveL: solveL,
    fix: fix,
    mix: mix,
    rgba: rgba,
    derive: derive,
    LEVELS: LEVELS,
    SEM: SEM
  };
  root.ERP_COLOR = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));

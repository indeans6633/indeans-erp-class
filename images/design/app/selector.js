/* 디자인 선택창 — 1단계 테마 4 → 2단계 밝기·미리 보기. 데이터는 전부 가짜 예시.
   테마는 인터뷰 업종 가지(B1~B8)에 맞춰 17:25·17:26에 다시 짬. */
(function () {
  'use strict';
  var C = window.ERP_COLOR;
  // 인터뷰 가지 → 추천 테마. 모든 가지(B1~B8)에 기본 추천이 하나씩 있다.
  var BRANCH_THEME = {
    B1: 'large', B2: 'shop', B3: 'shop', B4: 'large',
    B5: 'list', B6: 'shop', B7: 'list', B8: 'brand'
  };
  var BRANCH_NAME = {
    B1: '집 공사·수리·설치', B2: '가게·쇼핑몰', B3: '식당·카페·음식',
    B4: '예약·방문 서비스', B5: '공장·제작·도매·유통', B6: '학원·교습·강의',
    B7: '사무 서비스', B8: '그 밖'
  };
  var THEMES = [
    { id: 'shop', name: '따뜻한 매장',
      desc: '밝은 크림 바탕, 사진이 크고 모서리가 둥글어요. 손님이 들어와 보는 첫인상에 잘 맞습니다.',
      fits: '가게·쇼핑몰, 식당·카페·음식, 학원·교습·강의',
      seed: '#C45C26', defaultScheme: 'light',
      shape: { r: '22px', rsm: '14px', rbtn: '999px', shadow: '0 8px 24px rgba(80,40,16,.10)', head: "'GowunBatang',serif", headls: '0', tap: '46px', fs: '15px', lw: '1px', hero: '230px', thumb: '100px', gap: '16px', pad: '22px' } },
    { id: 'large', name: '큰 글씨',
      desc: '글씨와 단추가 크고, 줄은 두껍고 모서리는 거의 없습니다. 햇빛 아래·작은 폰·밖에서 쓰기 좋아요.',
      fits: '집 공사·수리·설치, 예약·방문 서비스',
      seed: '#CA8A04', defaultScheme: 'light',
      shape: { r: '4px', rsm: '2px', rbtn: '4px', shadow: 'none', head: "'Pretendard',sans-serif", headls: '-.03em', tap: '56px', fs: '18px', lw: '2.5px', hero: '140px', thumb: '84px', gap: '10px', pad: '14px' } },
    { id: 'list', name: '촘촘한 목록',
      desc: '한 화면에 많이, 줄이 반듯하고 글씨는 작습니다. 표·숫자·여러 건을 같이 보는 일에 맞아요.',
      fits: '공장·제작·도매·유통, 사무 서비스',
      seed: '#0F766E', defaultScheme: 'light',
      shape: { r: '2px', rsm: '2px', rbtn: '2px', shadow: 'none', head: "'Pretendard',sans-serif", headls: '-.02em', tap: '38px', fs: '13.5px', lw: '1px', hero: '72px', thumb: '0px', gap: '8px', pad: '12px' } },
    { id: 'brand', name: '우리 회사 색',
      desc: '기본이 어두운 화면이고, 색 면이 넓게 들어갑니다. 로고 색 하나만 넣으면 나머지를 맞춰 줍니다.',
      fits: '그 밖 · 로고 색을 살리고 싶을 때(모든 업종)',
      seed: null, defaultScheme: 'dark',
      shape: { r: '28px', rsm: '18px', rbtn: '18px', shadow: '0 0 0 1px rgba(255,255,255,.08)', head: "'Pretendard',sans-serif", headls: '.04em', tap: '48px', fs: '16px', lw: '0px', hero: '200px', thumb: '88px', gap: '18px', pad: '20px' } }
  ];
  var LAYOUT_DEFAULTS = {
    shop: { nav: 'top', content: 'cards' },
    large: { nav: 'bottom', content: 'cards' },
    list: { nav: 'side', content: 'table' },
    brand: { nav: 'top', content: 'board' }
  };
  var st = { theme: '', scheme: 'light', screen: 'board', width: 'pc', brand: '#6D28D9', recommend: '', nav: 'top', content: 'board' };
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');

  function themeOf(id) { return THEMES.filter(function (t) { return t.id === id; })[0]; }
  function seedOf(t) { return t.seed || C.normHex(st.brand) || '#6D28D9'; }

  function parseBranch(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var u = s.toUpperCase().replace(/^BRANCH[-_]?/, '');
    if (/^[1-8]$/.test(u)) return 'B' + u;
    if (/^B[1-8]$/.test(u)) return u;
    var keys = Object.keys(BRANCH_NAME);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i], n = BRANCH_NAME[id];
      if (s === n || s.indexOf(n) === 0 || n.indexOf(s) !== -1) return id;
    }
    // 짧은 별칭
    if (/공사|수리|설치/.test(s)) return 'B1';
    if (/가게|쇼핑몰|물건/.test(s)) return 'B2';
    if (/식당|카페|음식/.test(s)) return 'B3';
    if (/예약|방문|미용|청소|돌봄/.test(s)) return 'B4';
    if (/공장|제작|도매|유통/.test(s)) return 'B5';
    if (/학원|교습|강의/.test(s)) return 'B6';
    if (/사무|세무|중개/.test(s)) return 'B7';
    if (/그 밖|기타/.test(s)) return 'B8';
    return '';
  }

  // 테마 단추
  THEMES.forEach(function (t) {
    var b = document.createElement('button');
    b.className = 'th th-' + t.id; b.setAttribute('role', 'radio'); b.dataset.v = t.id;
    b.innerHTML = '<div class="mini" aria-hidden="true"></div>' +
      '<div><b>' + t.name + '</b><span>' + t.desc + '</span><em class="fits">이런 업종: ' + t.fits + '</em><strong class="rec">인터뷰 추천</strong></div>';
    b.onclick = function () { st.theme = t.id; $('toDetail').disabled = false; syncThemeButtons(); };
    $('themes').appendChild(b);
  });
  function syncThemeButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.th'), function (b) {
      b.setAttribute('aria-checked', b.dataset.v === st.theme ? 'true' : 'false');
      b.classList.toggle('is-rec', st.recommend && b.dataset.v === st.recommend);
    });
  }
  function showDetail() {
    if (!st.theme) return;
    var t = themeOf(st.theme);
    if (t.defaultScheme) st.scheme = t.defaultScheme;
    st._schemeTouched = false;
    var lay = LAYOUT_DEFAULTS[t.id] || { nav: 'top', content: 'board' };
    st.nav = lay.nav; st.content = lay.content;
    var rec = st._rec;
    if (rec && rec.theme === t.id) {
      if (rec.scheme === 'light' || rec.scheme === 'dark') st.scheme = rec.scheme;
      if (rec.nav) st.nav = rec.nav;
      if (rec.body) st.content = rec.body;
    }
    document.body.className = 'step-detail';
    $('themeStep').hidden = true;
    $('detailStep').hidden = false;
    $('lead').textContent = '2단계: 밝기, 메뉴 위치, 본문 모양을 확인하고 「이걸로 하기」를 누르세요. 테마를 바꾸려면 왼쪽에서 다시 고르면 됩니다. 화면은 가짜 예시입니다.';
    $('chosenName').textContent = t.name;
    render();
  }
  function showTheme() {
    document.body.className = 'step-theme';
    $('themeStep').hidden = false;
    $('detailStep').hidden = true;
    $('codeBox').hidden = true;
    var rec = st.recommend ? themeOf(st.recommend) : null;
    $('lead').textContent = rec
      ? '1단계: 테마를 하나만 고르세요. 인터뷰에서 고른 업종에 맞춰 「' + rec.name + '」을 먼저 골라 두었습니다. 다른 테마도 볼 수 있습니다. 화면의 회사·사람은 모두 가짜 예시입니다.'
      : '1단계: 테마를 하나만 고르세요. 고르면 그 테마로 밝기·미리 보기 등 세부 설정을 합니다. 각 카드 아래 「이런 업종」은 인터뷰 가지(B1~B8)에 맞춘 추천입니다. 화면의 회사·사람은 모두 가짜 예시입니다.';
    syncThemeButtons();
    if (window.requestAnimationFrame) requestAnimationFrame(scaleMinis);
    else scaleMinis();
  }
  $('toDetail').onclick = showDetail;
  $('backTheme').onclick = showTheme;
  function seg(id, key) {
    Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
      b.onclick = function () {
        st[key] = b.dataset.v;
        if (key === 'scheme') st._schemeTouched = true;
        render();
      };
    });
  }
  seg('scheme', 'scheme'); seg('screen', 'screen'); seg('width', 'width');
  seg('navPos', 'nav'); seg('content', 'content');
  function syncBrand(v) {
    var h = C.normHex(v);
    if (h) { st.brand = h; $('brandPick').value = h; }
    render();
  }
  $('brandPick').oninput = function (e) { $('brandHex').value = e.target.value.toUpperCase(); syncBrand(e.target.value); };
  $('brandHex').oninput = function (e) { syncBrand(e.target.value); };

  function styleApp(el, t, scheme) {
    var seed = t.seed || C.normHex(st.brand) || '#6D28D9';
    var r = C.derive(seed, scheme), c = r.c, s = t.shape, v = {};
    Object.keys(c).forEach(function (k) { v['--' + k] = c[k]; });
    v['--r'] = s.r; v['--r-sm'] = s.rsm; v['--r-btn'] = s.rbtn;
    v['--shadow'] = (scheme === 'dark' && t.id !== 'brand') ? 'none' : s.shadow;
    if (t.id === 'brand') v['--shadow'] = scheme === 'dark' ? '0 0 0 1px rgba(255,255,255,.10)' : '0 0 0 1px rgba(0,0,0,.08)';
    v['--head'] = s.head; v['--head-ls'] = s.headls; v['--tap'] = s.tap; v['--fs'] = s.fs; v['--lw'] = s.lw; v['--hero'] = s.hero; v['--thumb'] = s.thumb;
    v['--gap'] = s.gap; v['--pad'] = s.pad;
    Object.keys(v).forEach(function (k) { el.style.setProperty(k, v[k]); });
    return { seed: seed, r: r };
  }
  function apply() {
    if (!st.theme) return null;
    var t = themeOf(st.theme), out = styleApp(app, t, st.scheme);
    app.className = 'app ' + st.width + ' ' + t.id + ' nav-' + st.nav + ' content-' + st.content;
    var note = '', r = out.r;
    if (t.id === 'brand') {
      if (!C.normHex($('brandHex').value)) note = '색 코드를 #RRGGBB 꼴로 적어 주세요.';
      else if (r.notes.fillMoved || r.notes.textMoved) note = '글자가 잘 보이도록 색을 조금 옮겼어요 → 단추 ' + r.notes.fill + (r.notes.textMoved ? ' · 글자 ' + r.notes.text : '');
      else note = '이 색 그대로 써도 글자가 잘 보여요.';
    }
    $('brandNote').textContent = note;
    $('brand').hidden = t.id !== 'brand';
    return out.seed;
  }

  var SAMPLE = {
    shop: {
      firm: '예시가게', navOn: { board: '보드', inquiry: '주문', detail: '보드' },
      add: '+ 주문 추가', stages: ['문의', '예약', '준비 중', '방문', '완료'],
      today: [['오늘 예약', '3'], ['준비 중', '4'], ['답 안 한 문의', '1']],
      inquiry: { hero: '가게 사진(예시)', h1: '무엇을 예약해 드릴까요?', lead: '남겨 주시면 담당자가 하루 안에 연락드려요. 자세한 안내는 확인 뒤에 드립니다.',
        f1: ['성함', '홍길동(예시)'], f2: ['연락처', '010-0000-0000'], f3: ['인원·수량', '4명'],
        opts1: ['종류', ['케이크', '점심 단체', '포장', '기타'], 0],
        opts2: ['희망 때', ['오늘', '이번 주', '아직 모름'], 1],
        memo: '알레르기, 원하는 시간 등 편하게 적어 주세요', btn: '예약 남기기', fine: '로그인 없이 남길 수 있어요 · 남긴 내용은 상담에만 씁니다' },
      items: [
        [{ t: '주말 생일 케이크', chips: '<span class="chip">케이크</span><span class="chip">문의</span>', nx: '오늘 첫 연락' }, { t: '점심 단체 예약', chips: '<span class="chip late">답 안 함 · 1일</span>', nx: '담당 확인 필요' }],
        [{ t: '토요일 4인 테이블', chips: '<span class="chip p">예약 확정</span>', nx: '다음: 자리 준비 · 11/21(토)' }],
        [{ t: '포장 도시락 12개', chips: '<span class="chip p">준비 대기</span>', nx: '방문 수령 11/18(수) 낮 12시' }],
        [{ t: '기념일 꽃·케이크', ph: 'a', n: 3, chips: '<span class="chip p">포장 중</span>', bar: 50, nx: '다음: 픽업 · 오늘 18시' }, { t: '창가 자리 예약', ph: 'b', n: 1, chips: '<span class="chip late">지연 · 재료</span>', bar: 70, nx: '날짜 다시 잡기' }],
        [{ t: '평일 점심 세트', ph: 'c', n: 8, chips: '<span class="chip ok">완료</span>', nx: '후기 요청 없음' }]
      ],
      cnt: [2, 1, 1, 2, 1],
      detail: { chip: '준비 중', title: '기념일 꽃·케이크', sub: '케이크 · 담당 김매니저 · 예약 11/17 → 픽업 11/18 18시',
        progTitle: '준비 진행', progSub: '포장 2/4단계', steps: ['주문', '확인', '제작', '포장', '픽업', '완료'], now: 2,
        chk: [['주문', 1, '사진 2'], ['확인', 1, '전화 완료'], ['제작', 0, null], ['포장', 0, null]],
        photos: '상품 사진', memo1: '받는 회차', pay: ['예약금 받음', '잔금 안 받음'],
        memo2: '상담 메모', memoP: '<b>11/17</b> 초코·딸기 시트, 문구는 「축하해」. 알레르기 없음.' },
      cap: { inquiry: '손님이 링크·QR로 여는 첫 화면 — 로그인 없이 예약을 남기면 보드 「문의」 칸에 카드가 생깁니다.',
        board: '가게에서 함께 보는 화면 — 예약마다 카드 한 장, 단계 칸, 맨 위에 오늘 꼭 볼 것.',
        detail: '카드를 누르면 열리는 화면 — 준비 순서 체크 옆에 사진, 돈 받는 회차는 받음/안 받음만.' }
    },
    large: {
      firm: '예시서비스', navOn: { board: '보드', inquiry: '접수', detail: '보드' },
      add: '+ 접수 추가', stages: ['접수', '방문 전', '하는 중', '확인', '끝'],
      today: [['오늘 방문', '3'], ['하는 중', '2'], ['답 안 한 접수', '1']],
      inquiry: { hero: '방문 사진(예시)', h1: '어디에 가면 될까요?', lead: '주소와 원하는 시간만 남겨 주세요. 담당자가 하루 안에 연락드립니다.',
        f1: ['성함', '홍길동(예시)'], f2: ['연락처', '010-0000-0000'], f3: ['지역', '○○동'],
        opts1: ['일 종류', ['수리', '청소', '설치', '돌봄'], 0],
        opts2: ['희망 때', ['오늘', '이번 주', '아직 모름'], 0],
        memo: '출입 방법, 아픈 곳, 가져갈 도구 등 편하게 적어 주세요', btn: '방문 요청 남기기', fine: '로그인 없이 남길 수 있어요 · 남긴 내용은 방문 준비에만 씁니다' },
      items: [
        [{ t: '보일러 점검 요청', chips: '<span class="chip">수리</span><span class="chip">접수</span>', nx: '오늘 첫 연락' }, { t: '사무실 청소', chips: '<span class="chip late">답 안 함 · 1일</span>', nx: '담당 확인 필요' }],
        [{ t: '방문 설치 · 에어컨', chips: '<span class="chip p">내일 오전</span>', nx: '다음: 출발 전 확인 · 11/19(목)' }],
        [{ t: '가정 돌봄 2시간', chips: '<span class="chip p">하는 중</span>', nx: '오늘 15시까지 · 중간 연락' }],
        [{ t: '수도 누수 수리', ph: 'a', n: 2, chips: '<span class="chip p">부품 대기</span>', bar: 40, nx: '다음: 재방문 · 날짜 잡기' }, { t: '입주 청소', ph: 'b', n: 5, chips: '<span class="chip late">지연 · 키</span>', bar: 60, nx: '열쇠 전달 확인' }],
        [{ t: '정기 점검 11월', ph: 'c', n: 4, chips: '<span class="chip ok">끝</span>', nx: '다음 달 예약 없음' }]
      ],
      cnt: [2, 1, 1, 2, 1],
      detail: { chip: '하는 중', title: '수도 누수 수리', sub: '수리 · 담당 이기사 · 접수 11/17 → 방문 11/18 오전',
        progTitle: '방문 진행', progSub: '부품 대기', steps: ['접수', '출발', '작업', '사진', '확인', '끝'], now: 2,
        chk: [['접수', 1, '사진 1'], ['출발', 1, '연락 완료'], ['작업', 0, null], ['사진', 0, null]],
        photos: '현장 사진', memo1: '받는 회차', pay: ['출장비 받음', '재료비 안 받음'],
        memo2: '방문 메모', memoP: '<b>11/17</b> 싱크대 아래. 주차는 건물 뒤. 오후 2시 이후만 가능.' },
      cap: { inquiry: '손님이 링크·QR로 여는 첫 화면 — 로그인 없이 방문 요청을 남기면 보드 「접수」 칸에 카드가 생깁니다.',
        board: '밖에서 폰으로 보기 쉬운 화면 — 건마다 카드 한 장, 글씨와 단추가 큽니다.',
        detail: '카드를 누르면 열리는 화면 — 방문 순서 체크 옆에 사진, 돈 받는 회차는 받음/안 받음만.' }
    },
    list: {
      firm: '예시사무', navOn: { board: '목록', inquiry: '접수', detail: '목록' },
      add: '+ 건 추가', stages: ['접수', '진행', '검토', '완료', '보류'],
      today: [['오늘 마감', '5'], ['검토 대기', '7'], ['늦은 일', '2']],
      inquiry: { hero: '의뢰 안내(예시)', h1: '어떤 일을 맡겨 주시겠어요?', lead: '한 줄로 남겨 주시면 담당자가 접수 번호를 알려 드립니다.',
        f1: ['담당자 이름', '홍길동(예시)'], f2: ['연락처', '010-0000-0000'], f3: ['회사명', '○○상사(예시)'],
        opts1: ['일 종류', ['제작', '발주', '기한 일', '기타'], 1],
        opts2: ['희망 마감', ['이번 주', '이번 달', '아직 모름'], 0],
        memo: '수량, 규격, 참고 번호 등 짧게 적어 주세요', btn: '의뢰 남기기', fine: '로그인 없이 남길 수 있어요 · 남긴 내용은 접수에만 씁니다' },
      items: [
        [{ t: '거래처 A 발주 12건', chips: '<span class="chip">발주</span><span class="chip">접수</span>', nx: '오늘 오전 접수' }, { t: '견적 회신 대기', chips: '<span class="chip late">2일 지남</span>', nx: '담당 확인' }],
        [{ t: '11월 제작 롯트 3', chips: '<span class="chip p">진행 40%</span>', nx: '마감 11/21(토)' }],
        [{ t: '계약서 검토 2건', chips: '<span class="chip p">검토 중</span>', nx: '회신 기한 11/19' }],
        [{ t: '출고 대기 SKU-204', chips: '<span class="chip p">포장</span>', bar: 80, nx: '출고 11/18' }, { t: '반품 확인 4건', chips: '<span class="chip late">지연</span>', bar: 30, nx: '사유 메모 필요' }],
        [{ t: '10월 정산 묶음', chips: '<span class="chip ok">완료</span>', nx: '보관만' }]
      ],
      cnt: [2, 1, 1, 2, 1],
      detail: { chip: '진행', title: '거래처 A 발주 12건', sub: '발주 · 담당 박대리 · 접수 11/16 → 마감 11/21',
        progTitle: '진행', progSub: '5/12건', steps: ['접수', '확인', '작업', '검토', '전달', '완료'], now: 2,
        chk: [['접수', 1, '수량 확인'], ['확인', 1, '재고 됨'], ['작업', 0, null], ['검토', 0, null]],
        photos: '첨부', memo1: '받는 회차', pay: ['선금 받음', '잔금 안 받음'],
        memo2: '업무 메모', memoP: '<b>11/16</b> 규격은 지난달과 같음. 납품서는 거래처 양식.' },
      cap: { inquiry: '거래처·의뢰인이 남기는 첫 화면 — 로그인 없이 한 줄을 남기면 목록 「접수」에 한 건이 생깁니다.',
        board: '한 화면에 많이 담는 목록 — 건마다 한 줄, 단계 칸, 맨 위에 오늘 마감·늦은 일.',
        detail: '한 건을 누르면 열리는 화면 — 진행 체크, 첨부, 돈 받는 회차는 받음/안 받음만.' }
    },
    brand: {
      firm: '예시회사', navOn: { board: '보드', inquiry: '문의', detail: '보드' },
      add: '+ 새 건', stages: ['들어옴', '하는 중', '확인', '끝', '보관'],
      today: [['오늘 할 일', '4'], ['확인 대기', '2'], ['늦은 일', '1']],
      inquiry: { hero: '우리 회사(예시)', h1: '무엇을 도와드릴까요?', lead: '남겨 주시면 담당자가 확인 뒤에 연락드립니다.',
        f1: ['성함', '홍길동(예시)'], f2: ['연락처', '010-0000-0000'], f3: ['어디', '○○시'],
        opts1: ['종류', ['문의', '주문', '방문', '기타'], 0],
        opts2: ['희망 때', ['빨리', '이번 주', '아직 모름'], 2],
        memo: '하고 싶은 말을 편하게 적어 주세요', btn: '문의 남기기', fine: '로그인 없이 남길 수 있어요 · 남긴 내용은 상담에만 씁니다' },
      items: [
        [{ t: '새 문의 한 건', chips: '<span class="chip">문의</span><span class="chip">들어옴</span>', nx: '오늘 오전' }, { t: '답 기다리는 건', chips: '<span class="chip late">1일</span>', nx: '담당 확인' }],
        [{ t: '진행 중인 일', chips: '<span class="chip p">하는 중</span>', nx: '다음 확인 11/20' }],
        [{ t: '검토 부탁 한 건', chips: '<span class="chip p">확인</span>', nx: '회신만 남음' }],
        [{ t: '마무리 직전', ph: 'a', n: 2, chips: '<span class="chip p">90%</span>', bar: 90, nx: '오늘 안' }, { t: '보류 한 건', ph: 'b', n: 1, chips: '<span class="chip late">보류</span>', bar: 20, nx: '날짜 다시' }],
        [{ t: '지난주 끝난 일', ph: 'c', n: 6, chips: '<span class="chip ok">끝</span>', nx: '보관' }]
      ],
      cnt: [2, 1, 1, 2, 1],
      detail: { chip: '하는 중', title: '진행 중인 일', sub: '담당 최매니저 · 시작 11/16 → 목표 11/22',
        progTitle: '진행', progSub: '3/6', steps: ['들어옴', '배정', '작업', '확인', '전달', '끝'], now: 2,
        chk: [['들어옴', 1, ''], ['배정', 1, ''], ['작업', 0, null], ['확인', 0, null]],
        photos: '자료', memo1: '받는 회차', pay: ['일부 받음', '나머지 안 받음'],
        memo2: '메모', memoP: '<b>11/16</b> 대표님 확인 뒤에 다음 단계로.' },
      cap: { inquiry: '손님이 여는 첫 화면 — 우리 회사 색이 넓게 들어갑니다. 내용은 가짜 예시입니다.',
        board: '색 면이 넓은 보드 — 로고 색을 바꿔 보면 화면 전체가 같이 바뀝니다.',
        detail: '한 건을 누르면 열리는 화면 — 진행 체크와 자료, 금액은 적지 않습니다.' }
    }
  };

  function navItems(d, activeKey) {
    var labels = [
      { k: 'board', n: d.navOn.board === '목록' ? '목록' : '보드' },
      { k: 'inquiry', n: d.navOn.inquiry },
      { k: 'cal', n: '일정' },
      { k: 'pic', n: '사진' }
    ];
    return labels.map(function (x) {
      var on = (activeKey === 'board' && x.k === 'board') || (activeKey === 'inquiry' && x.k === 'inquiry') || (activeKey === 'detail' && x.k === 'board');
      return '<span' + (on ? ' class="on"' : '') + '>' + x.n + '</span>';
    }).join('');
  }
  function wrap(d, activeKey, inner) {
    var nav = navItems(d, activeKey);
    var brand = '<div class="a-logo">예</div><b>' + d.firm + '</b>';
    var add = '<button class="btn">' + d.add + '</button>';
    if (st.nav === 'side') {
      return '<aside class="a-side"><div class="a-side-top">' + brand + '</div><nav class="a-nav">' + nav + '</nav>' + add + '</aside><div class="main">' + inner + '</div>';
    }
    if (st.nav === 'bottom') {
      return '<div class="a-top">' + brand + '<span class="sp"></span>' + add + '</div><div class="main">' + inner + '</div><nav class="tabbar">' + nav + '</nav>';
    }
    return '<div class="a-top">' + brand + '<nav class="a-nav">' + nav + '</nav><span class="sp"></span>' + add + '</div><div class="main">' + inner + '</div>';
  }
  function inquiry(d) {
    var q = d.inquiry;
    function opts(row) {
      return '<div class="fld"><label>' + row[0] + '</label><div class="opts">' + row[1].map(function (o, i) {
        return '<span class="opt' + (i === row[2] ? ' on' : '') + '">' + o + '</span>';
      }).join('') + '</div></div>';
    }
    return '<div class="inq"><div class="ph inq-hero"><span class="lab">' + q.hero + '</span></div>' +
      '<h1>' + q.h1 + '</h1><p class="lead">' + q.lead + '</p>' +
      '<div class="fld"><label>' + q.f1[0] + '</label><div class="in">' + q.f1[1] + '</div></div>' +
      '<div class="two"><div class="fld"><label>' + q.f2[0] + '</label><div class="in">' + q.f2[1] + '</div></div><div class="fld"><label>' + q.f3[0] + '</label><div class="in">' + q.f3[1] + '</div></div></div>' +
      opts(q.opts1) + opts(q.opts2) +
      '<div class="fld"><label>남기실 말씀</label><div class="in ta">' + q.memo + '</div></div>' +
      '<button class="btn">' + q.btn + '</button><p class="fine">' + q.fine + '</p></div>';
  }
  function item(o) {
    return '<div class="card it">' + (o.ph ? '<div class="ph ' + o.ph + '"><span class="lab">사진 ' + o.n + '</span></div>' : '') +
      '<b>' + o.t + '</b><div class="meta">' + o.chips + '</div>' + (o.bar != null ? '<div class="bar"><i style="width:' + o.bar + '%"></i></div>' : '') +
      '<div class="nx">' + o.nx + '</div></div>';
  }
  function allItems(d) {
    var rows = [];
    d.stages.forEach(function (s, i) {
      (d.items[i] || []).forEach(function (o) { rows.push({ stage: s, o: o }); });
    });
    return rows;
  }
  function mainView(d) {
    var today = d.today.map(function (x) { return '<div>' + x[0] + '<b>' + x[1] + '</b></div>'; }).join('');
    var style = st.content || 'board';
    if (style === 'table') {
      var tr = allItems(d).map(function (r) {
        return '<tr><td><span class="chip p">' + r.stage + '</span></td><td><b>' + r.o.t + '</b><div class="meta">' + r.o.chips + '</div></td><td class="nx">' + r.o.nx + '</td></tr>';
      }).join('');
      return '<div class="bd"><div class="today">' + today + '</div><table class="grid-table"><thead><tr><th>단계</th><th>일</th><th>다음</th></tr></thead><tbody>' + tr + '</tbody></table></div>';
    }
    if (style === 'cards') {
      var cards = allItems(d).map(function (r) {
        var o = r.o;
        return '<div class="card it big">' + (o.ph ? '<div class="ph ' + o.ph + '"><span class="lab">사진 ' + o.n + '</span></div>' : '') +
          '<span class="chip p">' + r.stage + '</span><b>' + o.t + '</b><div class="meta">' + o.chips + '</div>' +
          (o.bar != null ? '<div class="bar"><i style="width:' + o.bar + '%"></i></div>' : '') +
          '<div class="nx">' + o.nx + '</div></div>';
      }).join('');
      return '<div class="bd"><div class="today">' + today + '</div><div class="card-grid">' + cards + '</div></div>';
    }
    return '<div class="bd"><div class="today">' + today + '</div><div class="cols">' +
      d.stages.map(function (s, i) { return '<div class="col"><h3>' + s + '<span>' + d.cnt[i] + '</span></h3>' + d.items[i].map(item).join('') + '</div>'; }).join('') +
      '</div></div>';
  }
  function detail(d) {
    var x = d.detail;
    var steps = x.steps.map(function (s, i) { return '<div class="' + (i < x.now ? 'done' : i === x.now ? 'now' : '') + '">' + s + '</div>'; }).join('');
    var chk = x.chk.map(function (row, i) {
      return '<div class="chk' + (row[1] ? ' done' : '') + '"><span class="bx">' + (row[1] ? '✓' : '') + '</span><span class="t"><b>' + row[0] + '</b>' + (row[2] ? ' <span class="muted small">· ' + row[2] + '</span>' : '') + '</span>' + (row[1] ? '<span class="chip ok">완료</span>' : '<button class="btn ' + (i === x.now ? '' : 'ghost') + '">사진 올리기</button>') + '</div>';
    }).join('');
    return '<div class="dt"><div class="dt-head"><div><span class="chip p">' + x.chip + '</span><h2 style="margin-top:8px">' + x.title + '</h2><div class="muted small" style="margin-top:4px">' + x.sub + '</div></div><button class="btn ghost">기록 보기</button></div>' +
      '<div><div class="card prog"><div class="sec-t"><h3>' + x.progTitle + '</h3><span class="muted small">' + x.progSub + '</span></div><div class="steps">' + steps + '</div>' + chk + '</div></div>' +
      '<div style="display:grid;gap:16px;align-content:start"><div class="card photos"><div class="sec-t"><h3>' + x.photos + '</h3><span class="muted small">예시</span></div><div class="grid"><div class="ph a"></div><div class="ph b"></div><div class="ph c"></div><div class="ph c"></div><div class="ph a"></div><div class="ph b"></div></div></div>' +
      '<div class="card memo"><div class="sec-t"><h3>' + x.memo1 + '</h3></div><div class="pay">' + x.pay.map(function (p, i) { return '<span class="chip' + (i === 0 ? ' ok' : '') + '">' + p + '</span>'; }).join('') + '</div><p>금액은 이 화면에 적지 않아요.</p></div>' +
      '<div class="card memo"><div class="sec-t"><h3>' + x.memo2 + '</h3></div><p>' + x.memoP + '</p></div></div></div>';
  }

  function code(seed) {
    return 'theme-' + st.theme + '-' + seed.replace('#', '').toUpperCase() + '-' + st.scheme + '-' + st.nav + '-' + st.content;
  }
  function render() {
    var seed = apply();
    if (!seed) return;
    var d = SAMPLE[st.theme];
    syncThemeButtons();
    [['scheme', 'scheme'], ['screen', 'screen'], ['width', 'width'], ['navPos', 'nav'], ['content', 'content']].forEach(function (p) {
      var box = $(p[0]); if (!box) return;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === st[p[1]] ? 'true' : 'false'); });
    });
    var inner = st.screen === 'inquiry' ? inquiry(d) : st.screen === 'board' ? mainView(d) : detail(d);
    var key = st.screen === 'detail' ? 'detail' : st.screen;
    app.innerHTML = wrap(d, key, inner);
    $('pvCap').textContent = d.cap[st.screen];
    $('codeSay').textContent = '디자인은 ' + code(seed) + ' 로 할게요.';
  }
  // 저장 — design-pick.mjs 서버로 열렸으면(http://127.0.0.1) 조합 코드를 그 서버에 보낸다(POST /choose).
  // 파일로 연 판(file://)이나 서버가 끊긴 판은 코드만 보여 준다 → 대표가 그 문장을 AI 에게 말한다.
  var server = { on: false, token: '', timer: null };
  function api(path, body) {
    var o = { method: body ? 'POST' : 'GET', headers: {} };
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    if (server.token) o.headers['X-Pick-Token'] = server.token;
    return fetch(path, o).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }
  function say(msg, bad) {
    var n = $('saveNote');
    if (!n) { n = document.createElement('p'); n.id = 'saveNote'; n.className = 'save-note'; n.setAttribute('role', 'status'); $('codeBox').parentNode.insertBefore(n, $('codeBox')); }
    n.textContent = msg; n.classList.toggle('bad', !!bad);
  }
  $('go').onclick = function () {
    $('codeBox').hidden = false;
    if (!server.on) return;
    var seed = apply();
    if (!seed) return;
    $('go').disabled = true;
    say('저장하는 중…');
    api('/choose', { code: code(seed) }).then(function (r) {
      if (r.ok && r.data && r.data.ok) {
        server.on = false; clearInterval(server.timer);
        say('저장했습니다 (' + r.data.code + '). 이 창은 닫으셔도 됩니다. AI 대화로 돌아가 「골랐어요.」라고 말하세요.');
      } else {
        $('go').disabled = false;
        say('저장하지 못했습니다' + (r.data && r.data.error ? ': ' + r.data.error : '') + '. 아래 문장을 AI 에게 그대로 말해 주세요.', true);
      }
    }, function () {
      $('go').disabled = false; server.on = false;
      say('선택창 연결이 끊겼습니다. 아래 문장을 AI 에게 그대로 말해 주세요.', true);
    });
  };
  function connectServer() {
    if (!/^https?:$/.test(location.protocol) || !window.fetch) return;
    api('/api/state').then(function (r) {
      if (!r.ok || !r.data || r.data.app !== 'erp-design-pick' || !r.data.token) return;
      server.on = true; server.token = r.data.token;
      server.timer = setInterval(function () { api('/touch', {}).catch(function () {}); }, 60000);
      var rec = r.data.recommend;
      // 주소에 ?branch=·?theme= 가 없을 때만 서버 추천을 쓴다(주소가 먼저)
      if (rec && rec.theme && themeOf(rec.theme) && !/[?&](branch|theme|업종)=/.test(location.search)) {
        st.theme = rec.theme; st.recommend = rec.theme; $('toDetail').disabled = false;
        showTheme();
      }
      if (rec && rec.theme) {
        st._rec = rec;
        if (rec.theme === 'brand' && rec.seed) { st.brand = rec.seed; $('brandHex').value = rec.seed; $('brandPick').value = rec.seed; }
      }
    }).catch(function () { /* 파일로 연 판과 같게 — 코드만 */ });
  }
  $('copy').onclick = function () {
    var t = $('codeSay').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { $('copy').textContent = '복사됨'; }, function () { $('copy').textContent = '글자를 직접 복사해 주세요'; });
  };

  var MINI_W = 1120;
  function scaleMinis() {
    Array.prototype.forEach.call(document.querySelectorAll('.th .mini'), function (box) {
      var el = box.querySelector('.app');
      if (!el || !box.clientWidth) return;
      var sc = box.clientWidth / MINI_W;
      el.style.width = MINI_W + 'px';
      el.style.transform = 'scale(' + sc + ')';
      el.style.transformOrigin = 'top left';
    });
  }
  function paintMinis() {
    THEMES.forEach(function (t) {
      var b = document.querySelector('.th[data-v="' + t.id + '"]');
      if (!b) return;
      var box = b.querySelector('.mini');
      var prev = { nav: st.nav, content: st.content, theme: st.theme };
      var def = LAYOUT_DEFAULTS[t.id] || { nav: 'top', content: 'board' };
      st.nav = def.nav; st.content = def.content; st.theme = t.id;
      var el = document.createElement('div');
      el.className = 'app pc ' + t.id + ' nav-' + st.nav + ' content-' + st.content;
      styleApp(el, t, t.defaultScheme || 'light');
      var html = wrap(SAMPLE[t.id], 'board', mainView(SAMPLE[t.id]));
      el.innerHTML = html.replace(/<button(\s)/g, '<span$1').replace(/<\/button>/g, '</span>');
      box.innerHTML = '';
      box.appendChild(el);
      st.nav = prev.nav; st.content = prev.content; st.theme = prev.theme;
    });
    scaleMinis();
  }
  window.addEventListener('resize', scaleMinis);

  // 인터뷰 업종으로 추천 테마를 미리 고름: ?branch=B3 또는 ?theme=shop
  (function applyRecommend() {
    var q = {};
    try { q = Object.fromEntries(new URLSearchParams(location.search)); } catch (e) { q = {}; }
    var br = parseBranch(q.branch || q.업종 || '');
    var id = q.theme;
    if (br && BRANCH_THEME[br]) id = BRANCH_THEME[br];
    if (id && themeOf(id)) {
      st.theme = id;
      st.recommend = id;
      $('toDetail').disabled = false;
      var recN = $('recNote');
      if (recN) {
        recN.hidden = false;
        recN.textContent = br
          ? '인터뷰에서 고른 업종(「' + BRANCH_NAME[br] + '」)에 맞춰 「' + themeOf(id).name + '」을 먼저 골라 두었습니다. 다른 테마를 고르셔도 됩니다.'
          : '「' + themeOf(id).name + '」을 먼저 골라 두었습니다. 다른 테마를 고르셔도 됩니다.';
      }
    }
    showTheme();
    paintMinis();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scaleMinis);
    connectServer();
  })();
}());

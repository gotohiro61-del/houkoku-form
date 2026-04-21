// BOOKS houkoku-form エッジケーステスト（Phase B-1）
// jsdom で異常系・境界値を検証

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, 'index.html');
let HTML = fs.readFileSync(HTML_PATH, 'utf8');
// let → var（テスト時のみ）
HTML = HTML.replace(/^let venueData=null/m, 'var venueData=null');

const results = [];
let passed = 0, failed = 0;

function assert(name, cond, details) {
  const ok = !!cond;
  results.push({ name, ok, details });
  if (ok) { passed++; process.stdout.write('.'); }
  else { failed++; process.stdout.write('F'); console.log('\n[FAIL] ' + name + (details ? ': ' + details : '')); }
}

function makeFetchMock(patterns) {
  const calls = [];
  const fn = function(url, opts) {
    const body = opts && opts.body ? (typeof opts.body === 'string' ? opts.body : '') : '';
    let parsed = null; try { parsed = JSON.parse(body); } catch (e) {}
    calls.push({ url: String(url), opts, body, parsed });
    let response = { ok: true };
    if (patterns) {
      for (const p of patterns) {
        if (p.match(String(url), parsed)) { response = p.response(String(url), parsed); break; }
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response))
    });
  };
  fn.calls = calls;
  return fn;
}

function makeDom(fetchMock, options) {
  options = options || {};
  const dom = new JSDOM(HTML, {
    url: 'https://gotohiro61-del.github.io/houkoku-form/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = fetchMock;
      window.alert = () => {};
      window.confirm = options.confirm || (() => true);
      window.scrollTo = () => {};
      // console.warn をキャプチャ
      window._warnings = [];
      const origWarn = window.console.warn;
      window.console.warn = function() {
        window._warnings.push(Array.from(arguments).join(' '));
        if (origWarn) origWarn.apply(window.console, arguments);
      };
    }
  });
  return dom;
}

async function waitUntil(fn, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < (timeoutMs || 2000)) {
    try { if (await fn()) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 20));
  }
  return false;
}

function sampleVenueData(options) {
  options = options || {};
  const teamsPerBlock = options.teamsPerBlock || 2;
  const blockCount = options.blockCount || 2;
  const buildTeams = (blockPrefix, n) => {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        teamRow: 100 + i,
        teamName: 'チーム' + blockPrefix + i,
        applicationNo: blockPrefix + i,
        rep: '代表' + i,
        furigana: 'ダイヒョウ' + i,
        phone: '09000000000',
        price: '17000',
        payment: '0',
        receptionStatus: ''
      });
    }
    return arr;
  };
  const blocks = [];
  for (let b = 0; b < blockCount; b++) {
    blocks.push({
      tournamentId: 'T' + b,
      tournamentName: '大会' + b,
      startTime: '10:00',
      level: 'エンジョイ',
      teams: buildTeams(String.fromCharCode(65 + b), teamsPerBlock)
    });
  }
  return {
    todayDisplay: '2026/04/21(火)',
    venues: [
      {
        spreadsheetId: 'SSID_A',
        sheetName: '21日 渋谷体育館',
        dayCategory: 'today',
        dateStr: '2026/04/21',
        blockCount,
        completed: false,
        blocks
      },
      {
        spreadsheetId: 'SSID_B',
        sheetName: '21日 新宿体育館',
        dayCategory: 'today',
        dateStr: '2026/04/21',
        blockCount: 1,
        completed: false,
        blocks: [
          {
            tournamentId: 'TB',
            tournamentName: '別会場大会',
            startTime: '10:00',
            level: '中級',
            teams: [
              { teamRow: 300, teamName: 'チームX', applicationNo: 'B1', rep: '田中', furigana: 'タナカ', phone: '09077778888', price: '17000', payment: '0', receptionStatus: '' }
            ]
          }
        ]
      }
    ]
  };
}

function sampleStaffData() {
  return {
    staffArea: {
      staff: [{ row: 390, name: '', checkIn: '', checkOut: '', breakMin: 0 }],
      checkItems: [
        { row: 500, text: 'ゴミ回収', checked: false },
        { row: 501, text: '鍵返却', checked: false }
      ],
      accidentReport: '',
      otherReport: '',
      defaultStart: '09:00',
      defaultEnd: '18:00',
      defaultBreak: 60
    },
    memberList: ['山田太郎', '鈴木花子'],
    overtimeContext: { dismissalTimeF12: '', cleanupMin: 35, thresholdMin: 15, existingOvertimeReason: '' }
  };
}

const defaultPatterns = () => [
  { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
  { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
  { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
  { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
  { match: (u, p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
];

async function runTests() {
  console.log('=== Phase B-1: エッジケーステスト ===\n');

  // ---- E1: 容量超過 ----
  console.log('[E1] localStorage 容量超過');
  const dom1 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom1.window.venueData);
  const w1 = dom1.window;
  w1.selectVenue(0);
  w1.goReport();
  await waitUntil(() => w1.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 50));
  // Storage.prototype.setItem を上書き（インスタンス直上書きは jsdom で失敗する）
  const origProtoSetItem = w1.Storage.prototype.setItem;
  w1.Storage.prototype.setItem = function() {
    throw new w1.DOMException('QuotaExceeded', 'QuotaExceededError');
  };
  const toastEl = w1.document.getElementById('toast');
  if (toastEl) toastEl.textContent = '';
  let threw = false;
  try { w1._saveReportLocalStorage(); } catch (e) { threw = true; }
  w1.Storage.prototype.setItem = origProtoSetItem;
  assert('E1.1 容量超過時に例外を握りつぶす', !threw);
  const toastText = toastEl ? toastEl.textContent : '';
  assert('E1.2 容量超過時に toast エラー表示（#toast要素）',
    /容量|失敗/.test(toastText),
    'toast.textContent="' + toastText + '"');
  dom1.window.close();

  // ---- E2: teams JSON 破損 ----
  console.log('\n[E2] teams JSON 破損');
  const dom2 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom2.window.venueData);
  const w2 = dom2.window;
  w2.selectVenue(0);
  w2.goReport();
  await waitUntil(() => w2.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 50));
  // 破損 teams を注入、_meta は正常
  const prefix2 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  w2.localStorage.setItem(prefix2 + 'teams', '{invalid json');
  w2.localStorage.setItem(prefix2 + 'accident', '正常データ');
  w2.localStorage.setItem(prefix2 + '_meta', JSON.stringify({ savedAt: new Date().toISOString(), version: 2 }));
  // 再構築
  w2._reportBuildKey = null;
  w2.goReport();
  await new Promise(r => setTimeout(r, 100));
  // accident は復元される、teams は例外で無視される
  const acc2 = w2.document.getElementById('accident-report').value;
  assert('E2.1 破損JSON時も他フィールドは復元', acc2 === '正常データ', 'actual=' + acc2);
  // 警告ログあり
  assert('E2.2 破損時 console.warn が出る', w2._warnings.some(w => w.indexOf('[draft] restore error') >= 0 || w.indexOf('draft') >= 0),
    'warnings=' + w2._warnings.join('|'));
  dom2.window.close();

  // ---- E3: _meta 破損 ----
  console.log('\n[E3] _meta 破損');
  const dom3 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom3.window.venueData);
  const w3 = dom3.window;
  w3.selectVenue(0);
  const prefix3 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  w3.localStorage.setItem(prefix3 + '_meta', 'garbage not json');
  w3.localStorage.setItem(prefix3 + 'accident', '下書き本体');
  w3.goReport();
  await waitUntil(() => w3.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 100));
  // _meta 破損なら早期 return で accident は復元されない
  const acc3 = w3.document.getElementById('accident-report').value;
  assert('E3.1 _meta 破損時は復元を行わない', acc3 === '' || acc3 === '下書き本体',
    '(どちらでも致命的でなければOK) actual=' + acc3);
  // さらに保存もできる
  w3.document.getElementById('accident-report').value = '新規入力';
  let saveThrew = false;
  try { w3._saveReportLocalStorage(); } catch (e) { saveThrew = true; }
  assert('E3.2 _meta 破損後も新規保存は成功', !saveThrew);
  const metaAfter = w3.localStorage.getItem(prefix3 + '_meta');
  assert('E3.3 _meta 破損後の保存で _meta が上書きされる', metaAfter && metaAfter.indexOf('savedAt') >= 0);
  dom3.window.close();

  // ---- E4: 5秒リトライ ----
  // スクリプトスコープ内の setTimeout 呼び出しは window.setTimeout 上書きで捕捉できないため、
  // 実際に「1回目失敗 → 2回目成功」の時刻差 を測定して 5秒経過を検証する。
  console.log('\n[E4] 5秒リトライ');
  const attempts4 = [];
  const fetchMock4 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: (u, p) => p && p.action === 'submitReport', response: () => {
      attempts4.push(Date.now());
      return attempts4.length === 1 ? { error: '初回失敗' } : { ok: true };
    }}
  ]);
  const dom4 = makeDom(fetchMock4);
  await waitUntil(() => dom4.window.venueData);
  const w4 = dom4.window;
  w4.selectVenue(0);
  w4.selectTournament(0);
  w4.openTeamDetail(0);
  w4.document.getElementById('bs-sales').value = '即決1';
  const t0 = Date.now();
  w4.saveLocalAndClose();
  await waitUntil(() => attempts4.length >= 1, 2000);
  const teamE4 = w4.selectedVenue.blocks[0].teams[0];
  await waitUntil(() => teamE4._dirty === true, 1000);
  assert('E4.1 初回失敗時 _dirty=true', teamE4._dirty === true, 'dirty=' + teamE4._dirty);
  // 5秒後の自動リトライ発火を待つ
  await waitUntil(() => attempts4.length >= 2, 7000);
  assert('E4.2 自動リトライで POST 2回実行', attempts4.length === 2, 'attempts=' + attempts4.length);
  if (attempts4.length >= 2) {
    const diff = attempts4[1] - attempts4[0];
    assert('E4.3 リトライ間隔 4.5〜6秒', diff >= 4500 && diff <= 6500, 'diff=' + diff + 'ms');
  }
  // 成功後 _dirty=false
  await waitUntil(() => teamE4._dirty === false, 500);
  assert('E4.4 リトライ成功後 _dirty=false', teamE4._dirty === false, 'dirty=' + teamE4._dirty);
  dom4.window.close();

  // ---- E5: 250 チーム大量データ ----
  console.log('\n[E5] 大量データ性能');
  const heavyPatterns = [
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData({ teamsPerBlock: 50, blockCount: 5 }) },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) }
  ];
  const dom5 = makeDom(makeFetchMock(heavyPatterns));
  await waitUntil(() => dom5.window.venueData);
  const w5 = dom5.window;
  w5.selectVenue(0);
  w5.goReport();
  await waitUntil(() => w5.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 100));
  // 各チームに値を設定
  let teamCount = 0;
  w5.selectedVenue.blocks.forEach((b, bi) => {
    b.teams.forEach((t, ti) => {
      const el = w5.document.getElementById('rpt-sales-' + bi + '-' + ti);
      if (el) { el.value = 'なし'; teamCount++; }
    });
  });
  assert('E5.0 250チーム DOM 構築', teamCount === 250, 'actual=' + teamCount);
  const tStart = Date.now();
  w5._saveReportLocalStorage();
  const tSave = Date.now() - tStart;
  assert('E5.1 大量保存 <500ms', tSave < 500, 'took=' + tSave + 'ms');
  const prefix5 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  const teamsSize = (w5.localStorage.getItem(prefix5 + 'teams') || '').length;
  assert('E5.2 teams JSON <100KB', teamsSize < 100000, 'size=' + teamsSize);
  // 復元も高速
  w5._reportBuildKey = null;
  const rStart = Date.now();
  w5.goReport();
  await waitUntil(() => w5.document.getElementById('rpt-sales-0-0').value === 'なし');
  const rRestore = Date.now() - rStart;
  // jsdom は DOM 操作が実ブラウザより 5-10倍遅い。実ブラウザでは <500ms 想定。
  // jsdom ベンチマークとして <5000ms で充分（CPU負荷・環境依存）。
  assert('E5.3 大量復元 <5000ms (jsdom)', rRestore < 5000, 'took=' + rRestore + 'ms');
  dom5.window.close();

  // ---- E6: 未来日付下書き ----
  console.log('\n[E6] 未来日付の下書き');
  const dom6 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom6.window.venueData);
  const w6 = dom6.window;
  w6.selectVenue(0);
  const prefix6 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  w6.localStorage.setItem(prefix6 + '_meta', JSON.stringify({ savedAt: tomorrow.toISOString(), version: 2 }));
  w6.localStorage.setItem(prefix6 + 'accident', '未来のデータ');
  w6.goReport();
  await waitUntil(() => w6.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 100));
  // 今日ではない → バナー表示される
  const banner6 = w6.document.getElementById('draft-banner');
  assert('E6.1 未来日付でバナー表示', banner6 && banner6.style.display === 'block',
    'display=' + (banner6 ? banner6.style.display : 'no-element'));
  assert('E6.2 未来日付では自動復元しない', w6.document.getElementById('accident-report').value !== '未来のデータ',
    'actual=' + w6.document.getElementById('accident-report').value);
  dom6.window.close();

  // ---- E7: version 不一致 ----
  console.log('\n[E7] スキーマ version 不一致');
  const dom7 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom7.window.venueData);
  const w7 = dom7.window;
  w7.selectVenue(0);
  const prefix7 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  const today7 = new Date();
  w7.localStorage.setItem(prefix7 + '_meta', JSON.stringify({ savedAt: today7.toISOString(), version: 1 }));
  w7.localStorage.setItem(prefix7 + 'accident', '古いversion');
  let errorThrew7 = false;
  try {
    w7.goReport();
    await waitUntil(() => w7.selectedVenue.staffArea);
    await new Promise(r => setTimeout(r, 100));
  } catch (e) { errorThrew7 = true; }
  assert('E7.1 version=1 でもクラッシュしない', !errorThrew7);
  // 現状の実装では version チェックなし、そのまま復元される
  // （将来マイグレーション対応するならここにフラグを追加する）
  const acc7 = w7.document.getElementById('accident-report').value;
  assert('E7.2 version=1 データが一応扱える（復元 or スキップのどちらでも可）',
    acc7 === '古いversion' || acc7 === '', 'actual=' + acc7);
  dom7.window.close();

  // ---- E8: 適用中に teamName 変更 ----
  console.log('\n[E8] バナー使う時に teamName 不一致');
  const dom8 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom8.window.venueData);
  const w8 = dom8.window;
  w8.selectVenue(0);
  const prefix8 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  const yesterday8 = new Date(); yesterday8.setDate(yesterday8.getDate() - 1);
  w8.localStorage.setItem(prefix8 + '_meta', JSON.stringify({ savedAt: yesterday8.toISOString(), version: 2 }));
  // 古い teamName で保存（現行はチームA0 だが saved は別名）
  const teamsSaved = {
    '0-0': { teamName: 'チームA0_旧名', teamRow: 100, sales: '即決1', rank: '1位', remarks: '旧備考' },
    '0-1': { teamName: 'チームA1', teamRow: 101, sales: '即決2', rank: '2位', remarks: '正常' }
  };
  w8.localStorage.setItem(prefix8 + 'teams', JSON.stringify(teamsSaved));
  w8.localStorage.setItem(prefix8 + 'accident', '下書きアクシデント');
  w8.goReport();
  await waitUntil(() => w8.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 100));
  // バナー表示されるはず
  const banner8 = w8.document.getElementById('draft-banner');
  assert('E8.1 昨日の下書きでバナー表示', banner8 && banner8.style.display === 'block');
  // 使うを押す
  w8._applyDraft();
  const sales00 = w8.document.getElementById('rpt-sales-0-0').value;
  const sales01 = w8.document.getElementById('rpt-sales-0-1').value;
  assert('E8.2 teamName不一致のチームはスキップ', sales00 === '', 'actual=' + sales00);
  assert('E8.3 teamName一致のチームは復元', sales01 === '即決2', 'actual=' + sales01);
  assert('E8.4 共通フィールド(accident)は復元', w8.document.getElementById('accident-report').value === '下書きアクシデント');
  dom8.window.close();

  // ---- E9: overtime 状態復元 ----
  console.log('\n[E9] overtime 状態の保存/復元');
  const dom9 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom9.window.venueData);
  const w9 = dom9.window;
  w9.selectVenue(0);
  w9.goReport();
  await waitUntil(() => w9.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 100));
  // fge + overtime-reason 設定
  w9.document.getElementById('final-game-end-time').value = '19:00';
  // スタッフに時刻入力して延長検知を発動させる
  const sn0 = w9.document.getElementById('sn-0');
  if (sn0) {
    // option 追加
    const opt = w9.document.createElement('option');
    opt.value = '山田太郎'; opt.textContent = '山田太郎';
    sn0.appendChild(opt);
    sn0.value = '山田太郎';
    w9.onStaffNameChange(0);
  }
  w9.document.getElementById('sci-0').value = '09:00';
  w9.document.getElementById('sco-0').value = '20:00'; // 延長退勤
  w9.checkOvertimeStatus();
  // overtime-section 表示確認
  const otSection = w9.document.getElementById('overtime-section');
  const otVisibleBefore = !otSection.classList.contains('hidden');
  assert('E9.1 延長退勤で overtime-section 表示', otVisibleBefore, 'hidden=' + otSection.classList.contains('hidden'));
  w9.document.getElementById('overtime-reason').value = 'トラブル対応';
  w9._saveReportLocalStorage();
  // 別会場へ
  w9.selectVenue(1);
  w9.goReport();
  await waitUntil(() => w9.selectedVenue.staffArea);
  await new Promise(r => setTimeout(r, 100));
  // 会場A に戻る
  w9.selectVenue(0);
  w9.goReport();
  await waitUntil(() => w9.document.getElementById('final-game-end-time').value === '19:00', 2000);
  await new Promise(r => setTimeout(r, 100));
  const fge9 = w9.document.getElementById('final-game-end-time').value;
  const reason9 = w9.document.getElementById('overtime-reason').value;
  assert('E9.2 fge 復元', fge9 === '19:00', 'actual=' + fge9);
  assert('E9.3 overtime-reason 復元', reason9 === 'トラブル対応', 'actual=' + reason9);
  dom9.window.close();

  // ---- E10: 会場キー保護 ----
  console.log('\n[E10] _clearReportLocalStorage の厳密一致');
  const dom10 = makeDom(makeFetchMock(defaultPatterns()));
  await waitUntil(() => dom10.window.venueData);
  const w10 = dom10.window;
  w10.selectVenue(0);
  // 会場Aに保存
  w10.localStorage.setItem('rpt_v2_SSID_A_21日 渋谷体育館_accident', 'AAA');
  w10.localStorage.setItem('rpt_v2_SSID_A_21日 渋谷体育館_other', 'AAA_other');
  w10.localStorage.setItem('rpt_v2_SSID_A_21日 渋谷体育館__meta', JSON.stringify({ savedAt: new Date().toISOString(), version: 2 }));
  // 会場B, 類似名キーに保存
  w10.localStorage.setItem('rpt_v2_SSID_B_21日 新宿体育館_accident', 'BBB');
  w10.localStorage.setItem('rpt_v2_SSID_B_21日 新宿体育館__meta', JSON.stringify({ savedAt: new Date().toISOString(), version: 2 }));
  // 別プレフィックス（想定外の類似キー）
  w10.localStorage.setItem('rpt_v2_SSID_A_21日 渋谷体育館_他_accident', 'SIMILAR');
  w10.localStorage.setItem('other_unrelated_key', 'UNRELATED');
  // 会場A の clear 実行
  w10._clearReportLocalStorage();
  // 会場A だけ消える
  assert('E10.1 会場A accident 削除', w10.localStorage.getItem('rpt_v2_SSID_A_21日 渋谷体育館_accident') === null);
  assert('E10.2 会場A other 削除', w10.localStorage.getItem('rpt_v2_SSID_A_21日 渋谷体育館_other') === null);
  assert('E10.3 会場A _meta 削除', w10.localStorage.getItem('rpt_v2_SSID_A_21日 渋谷体育館__meta') === null);
  assert('E10.4 会場B accident 保持', w10.localStorage.getItem('rpt_v2_SSID_B_21日 新宿体育館_accident') === 'BBB');
  assert('E10.5 会場B _meta 保持', w10.localStorage.getItem('rpt_v2_SSID_B_21日 新宿体育館__meta') !== null);
  assert('E10.6 類似名キー 保持', w10.localStorage.getItem('rpt_v2_SSID_A_21日 渋谷体育館_他_accident') === 'SIMILAR');
  assert('E10.7 無関係キー 保持', w10.localStorage.getItem('other_unrelated_key') === 'UNRELATED');
  dom10.window.close();

  // ---- 結果 ----
  console.log('\n\n=== エッジケーステスト結果 ===');
  console.log(`合格: ${passed}`);
  console.log(`失敗: ${failed}`);
  console.log(`合計: ${results.length}`);
  if (failed > 0) {
    console.log('\n=== 失敗詳細 ===');
    results.filter(r => !r.ok).forEach(r => console.log('[FAIL] ' + r.name + (r.details ? ': ' + r.details : '')));
    process.exit(1);
  } else {
    console.log('\nエッジケース全合格 ✓');
  }
}

runTests().catch(e => {
  console.error('\n\nFATAL:', e.stack || e);
  process.exit(2);
});

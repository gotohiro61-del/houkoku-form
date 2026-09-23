// BOOKS houkoku-form 改善要望 自動テストランナー
// jsdom でページを読み込み、fetchをmockして全機能を検証

const fs = require('fs');
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');

const HTML_PATH = path.join(__dirname, 'index.html');
let HTML = fs.readFileSync(HTML_PATH, 'utf8');
// テスト時のみ let → var に置換して window からアクセス可能にする（本番HTMLには影響なし）
HTML = HTML.replace(/^let venueData=null/m, 'var venueData=null');

// テスト結果
const results = [];
let passed = 0, failed = 0;

function assert(name, cond, details) {
  const ok = !!cond;
  results.push({ name, ok, details });
  if (ok) { passed++; process.stdout.write('.'); }
  else { failed++; process.stdout.write('F'); console.log('\n[FAIL] ' + name + (details ? ': ' + details : '')); }
}

// let宣言された変数にアクセスするヘルパー
function getLet(win, name) { return win.eval(name); }
function setLet(win, name, value) { win._tmp = value; win.eval(name + ' = window._tmp'); delete win._tmp; }

// fetch mock: 全てのAPI呼び出しを記録し、パターン別に応答を返す
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
    return Promise.resolve(mockResponse(response));
  };
  fn.calls = calls;
  return fn;
}

// fetch 応答の最小モック。PIN 認証ラッパーが res.clone().json() を呼ぶため clone も用意する
function mockResponse(response) {
  const res = {
    ok: true,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    clone: () => res
  };
  return res;
}

// PIN 認証済み状態（テスト用ダミー値。本物のトークンではない）
function seedAuth(window) {
  window.localStorage.setItem('pinAuth_token', 'unit-dummy-token');
  window.localStorage.setItem('pinAuth_pinVersion', '1');
  window.localStorage.setItem('pinAuth_expiresAt', String(Date.now() + 24 * 60 * 60 * 1000));
}

function makeDom(fetchMock) {
  const dom = new JSDOM(HTML, {
    url: 'https://gotohiro61-del.github.io/houkoku-form/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      seedAuth(window);
      window.fetch = fetchMock;
      window.alert = () => {};
      window.confirm = () => true;
      window.scrollTo = () => {};
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

// サンプル会場データ
function sampleVenueData() {
  return {
    todayDisplay: '2026/04/21(火)',
    venues: [
      {
        spreadsheetId: 'SSID_A',
        sheetName: '21日 渋谷体育館',
        dayCategory: 'today',
        dateStr: '2026/04/21',
        blockCount: 2,
        completed: false,
        blocks: [
          {
            tournamentId: 'T1', tournamentName: 'エンジョイ大会', startTime: '10:00', level: 'エンジョイ',
            teams: [
              { teamRow: 100, teamKey: 'T1|A1|チームa', teamName: 'チームA', applicationNo: 'A1', rep: '山田 太郎', furigana: 'ヤマダタロウ', phone: '09011112222', price: '17000', payment: '0', receptionStatus: '' },
              { teamRow: 101, teamKey: 'T1|A2|チームb', teamName: 'チームB', applicationNo: 'A2', rep: '鈴木 花子', furigana: 'スズキハナコ', phone: '09033334444', price: '17000', payment: '0', receptionStatus: '' }
            ]
          },
          {
            tournamentId: 'T2', tournamentName: '中級大会', startTime: '14:00', level: '中級',
            teams: [
              { teamRow: 200, teamKey: 'T2|A3|チームc', teamName: 'チームC', applicationNo: 'A3', rep: '佐藤', furigana: 'サトウ', phone: '09055556666', price: '17000', payment: '0', receptionStatus: '' }
            ]
          }
        ]
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
            tournamentId: 'T3', tournamentName: '上級大会', startTime: '10:00', level: '上級',
            teams: [
              { teamRow: 300, teamKey: 'T3|B1|チームx', teamName: 'チームX', applicationNo: 'B1', rep: '田中', furigana: 'タナカ', phone: '09077778888', price: '17000', payment: '0', receptionStatus: '' }
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
      staff: Array.from({ length: 13 }, (_, k) => ({
        row: 390 + k, slot: k, staffKey: k === 0 ? '山田太郎' : '', name: k === 0 ? '山田太郎' : '',
        checkIn: '', checkOut: '', breakMin: 0
      })),
      checkItems: [
        { row: 500, checkKey: 'ゴミ回収', text: 'ゴミ回収', checked: false },
        { row: 501, checkKey: '鍵返却', text: '鍵返却', checked: false }
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

// ======== テスト本体 ========

async function runTests() {
  console.log('=== BOOKS houkoku-form 改善要望テスト ===\n');

  // ---- TEST 1: 構文チェック + 初期ロード ----
  console.log('\n[1] 初期ロード・構文チェック');
  const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
  assert('1.1 scriptタグが存在', !!m);
  try { new Function(m[1]); assert('1.2 JavaScript構文OK', true); }
  catch (e) { assert('1.2 JavaScript構文OK', false, e.message); }

  const fetchMock1 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) }
  ]);
  const dom1 = makeDom(fetchMock1);
  await new Promise(r => setTimeout(r, 500));
  const win1 = dom1.window;
  assert('1.3 venueData 読み込み完了', !!win1.venueData && win1.venueData.venues.length === 2,
    'venues=' + (win1.venueData ? JSON.stringify(win1.venueData).substring(0,100) : 'null'));
  // let 宣言はグローバルでなくスクリプトスコープなので、関数経由で確認
  // saveLocalAndClose 関数などが使えるかで判定
  assert('1.4 _reportBuildKey 関連関数で使える', typeof win1.goReport === 'function');
  assert('1.5 グローバル関数 _saveTeamDataSilent 定義', typeof win1._saveTeamDataSilent === 'function');
  assert('1.6 グローバル関数 _updateDirtyBadge 定義', typeof win1._updateDirtyBadge === 'function');
  assert('1.7 グローバル関数 _saveReportLocalStorage 定義', typeof win1._saveReportLocalStorage === 'function');
  assert('1.8 グローバル関数 _restoreReportLocalStorage 定義', typeof win1._restoreReportLocalStorage === 'function');
  assert('1.9 グローバル関数 _cleanupOldDrafts 定義', typeof win1._cleanupOldDrafts === 'function');
  dom1.window.close();

  // ---- TEST 2: 要望4 - 即決クーポン無料招待 ----
  console.log('\n[2] 要望4: 即決クーポン『無料招待』');
  const fetchMock2 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getTeamEmail'), response: () => ({ email: 'test@example.com' }) },
    { match: (u,p) => p && p.action === undefined && p.bookings, response: (u,p) => ({ ok: true, db: 12, cw: 'OK', email: 'OK', reservationId: p.requestId }) }
  ]);
  const dom2 = makeDom(fetchMock2);
  await new Promise(r => setTimeout(r, 100));
  const w2 = dom2.window;
  // 会場→大会→チーム選択→即決画面遷移
  w2.selectVenue(0);
  w2.selectTournament(0);
  w2.openTeamDetail(0);
  w2.goSokketsu();
  await new Promise(r => setTimeout(r, 50));

  const couponSelect = w2.document.getElementById('sk-coupon1');
  assert('2.1 sk-coupon1 select存在', !!couponSelect);
  const optionValues = couponSelect ? Array.from(couponSelect.options).map(o => o.value) : [];
  assert('2.2 option "free" が存在', optionValues.indexOf('free') >= 0, 'options=' + JSON.stringify(optionValues));
  const freeOption = couponSelect ? Array.from(couponSelect.options).find(o => o.value === 'free') : null;
  assert('2.3 "free" のラベルに「無料招待」を含む', freeOption && freeOption.textContent.indexOf('無料招待') >= 0,
    freeOption ? freeOption.textContent : 'not found');

  // 金額17000 + 無料招待 → 小計0
  w2.document.getElementById('sk-price1').value = '17000';
  couponSelect.value = 'free';
  w2.skCalcTotal();
  const grandTotalEl = w2.document.getElementById('sk-grand-total').textContent;
  assert('2.4 無料招待選択時、合計が¥0', grandTotalEl.trim() === '-' || grandTotalEl.indexOf('¥0') >= 0 || grandTotalEl === '¥0',
    'actual=' + grandTotalEl);
  // 合計 == 0 の場合 '-' 表示ロジックなので '-' も OK
  const slotSummary1 = w2.document.getElementById('sk-slotSummary1').innerHTML;
  assert('2.5 小計行にクーポン-17,000表示', slotSummary1.indexOf('-¥17,000') >= 0 || slotSummary1.indexOf('無料招待') >= 0,
    'summary=' + slotSummary1.substring(0,200));

  // レンタル1500追加
  w2.document.getElementById('sk-bib1').value = '1';
  w2.skCalcTotal();
  const gt2 = w2.document.getElementById('sk-grand-total').textContent;
  assert('2.6 無料招待+レンタル1000 → 合計¥1,000', gt2.indexOf('¥1,000') >= 0, 'actual=' + gt2);

  // 通常クーポン1000も動作するか
  couponSelect.value = '1000';
  w2.document.getElementById('sk-bib1').value = '0';
  w2.skCalcTotal();
  const gt3 = w2.document.getElementById('sk-grand-total').textContent;
  assert('2.7 既存クーポン1000円引きは正常動作', gt3.indexOf('¥16,000') >= 0, 'actual=' + gt3);

  // doSubmitSokketsu で free の場合 subtotal=0 送信 ペイロード確認
  couponSelect.value = 'free';
  w2.skCalcTotal();
  w2.document.getElementById('sk-staff-name').value = 'テスター';
  w2.document.getElementById('sk-input-email').value = 'buyer@example.com';
  w2.document.getElementById('sk-date1').value = '2026-04-22';
  w2.document.getElementById('sk-venue1').value = '渋谷';
  w2.document.getElementById('sk-time1').value = '10:00';
  w2.document.getElementById('sk-level1').value = 'エンジョイ';
  w2.document.getElementById('sk-price1').value = '17000';
  // isSending=false であることを念のため
  w2.isSending = false;
  await w2.doSubmitSokketsu();
  await new Promise(r => setTimeout(r, 100));
  const sokketsuPosts = fetchMock2.calls.filter(c => c.parsed && c.parsed.bookings);
  assert('2.8 即決POST送信実行', sokketsuPosts.length >= 1);
  if (sokketsuPosts.length) {
    const last = sokketsuPosts[sokketsuPosts.length - 1].parsed;
    const bk = last.bookings[0];
    assert('2.9 couponValue="free" 送信', bk.couponValue === 'free', 'actual=' + bk.couponValue);
    assert('2.10 couponLabel="無料招待" 送信', bk.couponLabel === '無料招待', 'actual=' + bk.couponLabel);
    assert('2.11 discount=price 17000 送信', bk.discount === 17000, 'actual=' + bk.discount);
    assert('2.12 subtotal=0 送信', bk.subtotal === 0, 'actual=' + bk.subtotal);
    assert('2.13 requestId(UUID) 送信', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(last.requestId || ''), 'actual=' + last.requestId);
    assert('2.13b 選択中チームの teamKey を送る（R列の対応スタッフ転記の照合用）', last.teamKey === 'T1|A1|チームa', 'actual=' + last.teamKey);
  }
  assert('2.14 DB保存OKで完了画面表示', !w2.document.getElementById('screen-done').classList.contains('hidden'));
  dom2.window.close();

  // ---- TEST 3: 要望1 - チーム受付の自動保存 ----
  console.log('\n[3] 要望1: チーム受付 自動保存+dirty検出');
  const fetchMock3 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]);
  const dom3 = makeDom(fetchMock3);
  await new Promise(r => setTimeout(r, 100));
  const w3 = dom3.window;
  w3.selectVenue(0);
  w3.selectTournament(0);
  w3.openTeamDetail(0);
  // bs-sales, bs-rank 入力
  w3.document.getElementById('bs-sales').value = '即決1';
  w3.document.getElementById('bs-rank').value = '1位';
  w3.document.getElementById('bs-remarks').value = 'テスト備考';
  w3._onBSChange(); // 入力イベント相当（8c62e17 以降、閉じる時は保存待ちを確定する方式）
  w3.saveLocalAndClose();
  await new Promise(r => setTimeout(r, 50));

  const submitCalls = fetchMock3.calls.filter(c => c.parsed && c.parsed.action === 'submitReport');
  assert('3.1 閉じる時 submitReport 呼ばれる', submitCalls.length === 1);
  if (submitCalls.length) {
    const payload = submitCalls[0].parsed;
    assert('3.2 teamRow 正しく送信', payload.teams[0].teamRow === 100, 'actual=' + payload.teams[0].teamRow);
    assert('3.2b teamKey 正しく送信 (R02)', payload.teams[0].teamKey === 'T1|A1|チームa', 'actual=' + payload.teams[0].teamKey);
    assert('3.3 salesActivity 正しく送信', payload.teams[0].salesActivity === '即決1');
    assert('3.4 rank 正しく送信', payload.teams[0].rank === '1位');
    assert('3.5 remarks 正しく送信', payload.teams[0].remarks === 'テスト備考');
  }

  // 同値で再度閉じる → POSTされない（差分検出）
  await new Promise(r => setTimeout(r, 20));
  w3.openTeamDetail(0);
  w3._onBSChange(); // 同じ値のまま入力イベント → 差分検出(R2)で POST しないこと
  w3.saveLocalAndClose();
  await new Promise(r => setTimeout(r, 50));
  const submitCalls2 = fetchMock3.calls.filter(c => c.parsed && c.parsed.action === 'submitReport');
  assert('3.6 同値で再度閉じる → POST増えない(差分検出)', submitCalls2.length === 1, 'actual=' + submitCalls2.length);

  // 違う値で閉じる → POSTされる
  w3.openTeamDetail(0);
  w3.document.getElementById('bs-remarks').value = '違う備考';
  w3._onBSChange();
  w3.saveLocalAndClose();
  await new Promise(r => setTimeout(r, 50));
  const submitCalls3 = fetchMock3.calls.filter(c => c.parsed && c.parsed.action === 'submitReport');
  assert('3.7 値変更後は POST される', submitCalls3.length === 2, 'actual=' + submitCalls3.length);

  dom3.window.close();

  // ---- TEST 4: 要望1 - 保存失敗時のdirty処理 ----
  console.log('\n[4] 要望1: 保存失敗→dirty+toast+バッジ');
  const fetchMock4 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ error: 'シミュレート失敗' }) }
  ]);
  const dom4 = makeDom(fetchMock4);
  await new Promise(r => setTimeout(r, 100));
  const w4 = dom4.window;
  w4.selectVenue(0);
  w4.selectTournament(0);
  w4.openTeamDetail(0);
  w4.document.getElementById('bs-sales').value = '即決2';
  w4._onBSChange();
  w4.saveLocalAndClose();
  await new Promise(r => setTimeout(r, 100));
  const t0 = w4.selectedVenue.blocks[0].teams[0];
  assert('4.1 失敗時 t._dirty===true', t0._dirty === true, 'actual=' + t0._dirty);
  const badge = w4.document.querySelector('#sync-btn .dirty-badge');
  assert('4.2 sync-btn に dirty-badge 表示', !!badge, 'badge=' + (badge ? badge.textContent : 'none'));

  // syncTeamData が confirm を呼ぶ（ダーティあり）
  let confirmCalled = false;
  w4.confirm = (msg) => { confirmCalled = true; return false; };
  w4.syncTeamData();
  assert('4.3 dirty時 syncTeamData で confirm 表示', confirmCalled === true);
  dom4.window.close();

  // ---- TEST 5: 要望2A - DOM保持 ----
  console.log('\n[5] 要望2A: 報告画面 DOM保持');
  const fetchMock5 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]);
  const dom5 = makeDom(fetchMock5);
  await new Promise(r => setTimeout(r, 100));
  const w5 = dom5.window;
  w5.selectVenue(0);
  assert('5.1 selectVenue で _reportBuildKey=null', w5._reportBuildKey === null);

  w5.goReport();
  await new Promise(r => setTimeout(r, 100));
  const key1 = w5._reportBuildKey;
  assert('5.2 goReport 初回で _reportBuildKey 設定', key1 === 'SSID_A|21日 渋谷体育館', 'actual=' + key1);

  // アクシデントに入力
  w5.document.getElementById('accident-report').value = 'テストアクシデント';
  w5.document.getElementById('other-report').value = 'テストその他';
  // ダッシュボードへ戻る
  w5.goVenueDashboard();
  assert('5.3 ダッシュボード戻っても _reportBuildKey 保持', w5._reportBuildKey === key1);
  // 報告画面へ再入
  w5.goReport();
  await new Promise(r => setTimeout(r, 50));
  assert('5.4 DOM保持: アクシデント入力値保持', w5.document.getElementById('accident-report').value === 'テストアクシデント');
  assert('5.5 DOM保持: その他入力値保持', w5.document.getElementById('other-report').value === 'テストその他');

  // 別会場選択 → リセット
  w5.selectVenue(1);
  assert('5.6 別会場選択で _reportBuildKey=null', w5._reportBuildKey === null);
  w5.goReport();
  // staff fetch 完了待ち
  await waitUntil(() => w5.selectedVenue && w5.selectedVenue.staffArea, 2000);
  await new Promise(r => setTimeout(r, 50));
  const acc57 = w5.document.getElementById('accident-report').value;
  assert('5.7 別会場では入力空', acc57 === '', 'actual="' + acc57 + '"');
  // goVenueSelect
  w5.goVenueSelect();
  assert('5.8 goVenueSelect で _reportBuildKey=null', w5._reportBuildKey === null);
  dom5.window.close();

  // ---- TEST 6: 要望2B+3 - localStorage 保存/復元 ----
  console.log('\n[6] 要望2B+3: localStorage 保存/復元+R6検証');
  const fetchMock6 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]);
  const dom6 = makeDom(fetchMock6);
  await new Promise(r => setTimeout(r, 100));
  const w6 = dom6.window;
  w6.selectVenue(0);
  w6.goReport();
  await new Promise(r => setTimeout(r, 100));

  // 各種入力
  w6.document.getElementById('accident-report').value = '下書きアクシデント';
  w6.document.getElementById('other-report').value = '下書きその他';
  w6.document.getElementById('report-staff-name').value = '報告者A';
  w6.document.getElementById('rpt-sales-0-0').value = '即決3';
  w6.document.getElementById('rpt-rank-0-0').value = '2位';
  w6._saveReportLocalStorage();

  const prefix = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  assert('6.1 localStorage キー保存(accident)', w6.localStorage.getItem(prefix + 'accident') === '下書きアクシデント');
  assert('6.2 localStorage キー保存(other)', w6.localStorage.getItem(prefix + 'other') === '下書きその他');
  assert('6.3 localStorage キー保存(staff)', w6.localStorage.getItem(prefix + 'staff') === '報告者A');
  const teamsRaw = w6.localStorage.getItem(prefix + 'teams');
  const teamsMap = JSON.parse(teamsRaw || '{}');
  assert('6.4 localStorage teams に teamName/teamRow 保存 (R6)', teamsMap['0-0'] && teamsMap['0-0'].teamName === 'チームA' && teamsMap['0-0'].teamRow === 100,
    'actual=' + JSON.stringify(teamsMap['0-0']));
  assert('6.5 teams[0-0].sales=即決3', teamsMap['0-0'].sales === '即決3');
  const metaRaw = w6.localStorage.getItem(prefix + '_meta');
  const meta = JSON.parse(metaRaw || '{}');
  assert('6.6 _meta に savedAt タイムスタンプ', !!meta.savedAt);
  assert('6.7 _meta.version = 2', meta.version === 2);

  // 復元: 一度リセットして再入
  w6._reportBuildKey = null;
  w6.document.getElementById('accident-report').value = '';
  w6.document.getElementById('other-report').value = '';
  w6.document.getElementById('rpt-sales-0-0').value = '';
  w6.goReport();
  await new Promise(r => setTimeout(r, 100));
  // 今日保存なので即時復元される
  assert('6.8 復元: accident', w6.document.getElementById('accident-report').value === '下書きアクシデント');
  assert('6.9 復元: other', w6.document.getElementById('other-report').value === '下書きその他');
  assert('6.10 復元: rpt-sales-0-0', w6.document.getElementById('rpt-sales-0-0').value === '即決3');

  // R6検証: teamName を改ざんして復元 → スキップされる
  w6._reportBuildKey = null;
  w6.selectedVenue.blocks[0].teams[0].teamName = 'チームA_改名';
  w6.document.getElementById('rpt-sales-0-0') && (w6.document.getElementById('rpt-sales-0-0').value = '');
  w6.goReport();
  await new Promise(r => setTimeout(r, 100));
  const salesAfterMismatch = w6.document.getElementById('rpt-sales-0-0').value;
  assert('6.11 R6検証: teamName不一致で復元スキップ', salesAfterMismatch === '', 'actual=' + salesAfterMismatch);

  // バナー検証: 昨日の日付で保存 → バナー表示
  w6._reportBuildKey = null;
  w6.selectedVenue.blocks[0].teams[0].teamName = 'チームA'; // 戻す
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  w6.localStorage.setItem(prefix + '_meta', JSON.stringify({ savedAt: yesterday.toISOString(), sheetDate: '2026-04-20', version: 2 }));
  w6.localStorage.setItem(prefix + 'accident', '昨日の下書き');
  w6.goReport();
  await new Promise(r => setTimeout(r, 100));
  const banner = w6.document.getElementById('draft-banner');
  assert('6.12 昨日の下書きでバナー表示', banner && banner.style.display === 'block');
  assert('6.13 バナー時点では自動復元しない', w6.document.getElementById('accident-report').value !== '昨日の下書き' || w6.document.getElementById('accident-report').value === '');
  // 「使う」ボタン動作
  w6._applyDraft();
  assert('6.14 _applyDraft で復元', w6.document.getElementById('accident-report').value === '昨日の下書き');
  assert('6.15 _applyDraft でバナー非表示', banner.style.display === 'none');

  // 「破棄」ボタン動作: 再度バナー表示させて破棄
  w6.localStorage.setItem(prefix + '_meta', JSON.stringify({ savedAt: yesterday.toISOString(), sheetDate: '2026-04-20', version: 2 }));
  w6._pendingDraftMeta = null;
  w6._showDraftBanner(yesterday.toISOString());
  w6._discardDraft();
  assert('6.16 _discardDraft で localStorage クリア', w6.localStorage.getItem(prefix + 'accident') === null);
  assert('6.17 _discardDraft でバナー非表示', banner.style.display === 'none');

  dom6.window.close();

  // ---- TEST 7: 送信成功時の localStorage クリア ----
  console.log('\n[7] 要望2: 送信成功時 localStorageクリア');
  const fetchMock7 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]);
  const dom7 = makeDom(fetchMock7);
  await new Promise(r => setTimeout(r, 100));
  const w7 = dom7.window;
  w7.selectVenue(0);
  w7.goReport();
  await new Promise(r => setTimeout(r, 100));
  w7.document.getElementById('report-staff-name').value = '太郎';
  w7.document.getElementById('accident-report').value = 'A';
  w7.document.getElementById('final-game-end-time').value = '18:00';
  // 全チームに営業選択
  w7.selectedVenue.blocks.forEach((b, bi) => b.teams.forEach((t, ti) => {
    const el = w7.document.getElementById('rpt-sales-' + bi + '-' + ti);
    if (el) el.value = 'なし';
  }));
  // チェック項目全て
  (w7.selectedVenue.staffArea.checkItems || []).forEach((_, i) => {
    const c = w7.document.getElementById('chk-' + i);
    if (c) c.checked = true;
  });
  w7._saveReportLocalStorage();
  const prefix7 = 'rpt_v2_SSID_A_21日 渋谷体育館_';
  assert('7.1 事前: localStorage に保存', w7.localStorage.getItem(prefix7 + 'accident') === 'A');

  w7.isSending = false;
  await w7.doSubmitReport();
  await new Promise(r => setTimeout(r, 100));
  const rp7 = fetchMock7.calls.filter(c => c.parsed && c.parsed.action === 'submitReport' && c.parsed.markComplete === true);
  assert('7.0 最終報告 POST 1回', rp7.length === 1, 'actual=' + rp7.length);
  if (rp7.length) {
    const p7 = rp7[0].parsed;
    assert('7.0a teams[].teamKey 送信 (R02)', p7.teams.length === 3 && p7.teams.every(t => typeof t.teamKey === 'string' && t.teamKey), JSON.stringify(p7.teams.map(t => t.teamKey)));
    assert('7.0b staffList は staffKey＋slot（13枠・空き行は staffKey ""）', p7.staffList.length === 13 &&
      p7.staffList.every((s, k) => s.slot === k && typeof s.staffKey === 'string' && typeof s.breakMin === 'number') &&
      p7.staffList[0].staffKey === '山田太郎' && p7.staffList[0].name === '山田太郎' && p7.staffList.slice(1).every(s => s.staffKey === ''),
      JSON.stringify(p7.staffList.slice(0, 2)));
    assert('7.0c スタッフは行番号（row）を送らず slot を読取時の値のまま送る', !p7.staffList.some(s => 'row' in s) && p7.staffList.every((s, k) => s.slot === k));
    assert('7.0d checkItems は {checkKey, row(照合ヒント), checked}（R02）', JSON.stringify(p7.checkItems) === JSON.stringify([{ checkKey: 'ゴミ回収', row: 500, checked: true }, { checkKey: '鍵返却', row: 501, checked: true }]), JSON.stringify(p7.checkItems));
  }
  assert('7.0e 正常応答で完了画面', !w7.document.getElementById('screen-done').classList.contains('hidden'));
  assert('7.2 送信後: localStorage accident クリア', w7.localStorage.getItem(prefix7 + 'accident') === null);
  assert('7.3 送信後: localStorage staff クリア', w7.localStorage.getItem(prefix7 + 'staff') === null);
  assert('7.4 送信後: _meta クリア', w7.localStorage.getItem(prefix7 + '_meta') === null);
  assert('7.5 送信後: _reportBuildKey リセット', w7._reportBuildKey === null);
  dom7.window.close();

  // ---- TEST 8: 30日以上古い下書きのクリーンアップ ----
  console.log('\n[8] R9: 30日以上前のキー自動削除');
  const dom8 = makeDom(makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) }
  ]));
  await new Promise(r => setTimeout(r, 100));
  const w8 = dom8.window;
  const oldDate = new Date(); oldDate.setDate(oldDate.getDate() - 40);
  const recentDate = new Date(); recentDate.setDate(recentDate.getDate() - 10);
  const oldPrefix = 'rpt_v2_OLD_SS_OLD_SHEET_';
  const recentPrefix = 'rpt_v2_RECENT_SS_RECENT_SHEET_';
  w8.localStorage.setItem(oldPrefix + '_meta', JSON.stringify({ savedAt: oldDate.toISOString(), version: 2 }));
  w8.localStorage.setItem(oldPrefix + 'accident', 'OLD DATA');
  w8.localStorage.setItem(recentPrefix + '_meta', JSON.stringify({ savedAt: recentDate.toISOString(), version: 2 }));
  w8.localStorage.setItem(recentPrefix + 'accident', 'RECENT DATA');
  w8._cleanupOldDrafts();
  assert('8.1 40日前の _meta は削除', w8.localStorage.getItem(oldPrefix + '_meta') === null);
  assert('8.2 40日前の accident は削除', w8.localStorage.getItem(oldPrefix + 'accident') === null);
  assert('8.3 10日前の _meta は残る', w8.localStorage.getItem(recentPrefix + '_meta') !== null);
  assert('8.4 10日前の accident は残る', w8.localStorage.getItem(recentPrefix + 'accident') === 'RECENT DATA');
  dom8.window.close();

  // ---- TEST 9: 会場切替での分離（R4）----
  console.log('\n[9] R4: 会場ごとにlocalStorage分離');
  const dom9 = makeDom(makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) }
  ]));
  await new Promise(r => setTimeout(r, 100));
  const w9 = dom9.window;
  w9.selectVenue(0);
  w9.goReport();
  await new Promise(r => setTimeout(r, 100));
  w9.document.getElementById('accident-report').value = '会場A用';
  w9._saveReportLocalStorage();
  // 会場Bへ
  w9.selectVenue(1);
  w9.goReport();
  await new Promise(r => setTimeout(r, 100));
  w9.document.getElementById('accident-report').value = '会場B用';
  w9._saveReportLocalStorage();

  assert('9.1 会場Aキーに会場A用', w9.localStorage.getItem('rpt_v2_SSID_A_21日 渋谷体育館_accident') === '会場A用');
  assert('9.2 会場Bキーに会場B用', w9.localStorage.getItem('rpt_v2_SSID_B_21日 新宿体育館_accident') === '会場B用');
  // 会場A復帰時に会場Aの値が復元される
  w9.selectVenue(0);
  w9.goReport();
  await new Promise(r => setTimeout(r, 200));
  const acc93 = w9.document.getElementById('accident-report').value;
  assert('9.3 会場A復帰時に会場A用が復元', acc93 === '会場A用', 'actual="' + acc93 + '"');
  dom9.window.close();

  // ---- TEST 10: 既存機能の回帰テスト ----
  console.log('\n[10] 既存機能の回帰');
  const dom10 = makeDom(makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]));
  await new Promise(r => setTimeout(r, 100));
  const w10 = dom10.window;
  w10.selectVenue(0);
  w10.selectTournament(0);
  // 受付トグル
  w10.toggleReception(0);
  assert('10.1 toggleReception: 未→checked', w10.selectedVenue.blocks[0].teams[0].receptionStatus === 'checked');
  w10.toggleReception(0);
  assert('10.2 toggleReception: checked→cancel', w10.selectedVenue.blocks[0].teams[0].receptionStatus === 'cancel');
  w10.toggleReception(0);
  assert('10.3 toggleReception: cancel→未', w10.selectedVenue.blocks[0].teams[0].receptionStatus === '');
  // クーポン 既存通常値
  w10.openTeamDetail(0);
  w10.goSokketsu();
  await new Promise(r => setTimeout(r, 50));
  const couponOpts = w10.document.getElementById('sk-coupon1');
  ['0','1000','2000','3000','4000','5000','8000','free'].forEach((v, i) => {
    assert('10.4.' + i + ' クーポン選択肢 ' + v + ' 存在',
      Array.from(couponOpts.options).some(o => o.value === v));
  });
  dom10.window.close();

  // ---- TEST 11: R17 特殊文字のエスケープ回帰 ----
  console.log('\n[11] R17: 特殊文字は文字として表示（タグ・イベント属性を生成しない）');
  const XSS_NAME = '<img src=x id="inj-team" onerror="window.__xss=1">"\'&＜全角＞';
  const QUOTE_REMARK = '" autofocus onfocus="window.__xss=2" x="';
  const NL_NAME = '山田\n太郎 O\'Brien "Bob" ＆記号';
  const REP_HTML = '<img src=x id="inj-rep2" onerror="window.__xss=3">代表';
  const xssVenue = () => {
    const d = sampleVenueData();
    const b0 = d.venues[0].blocks[0];
    b0.tournamentName = '<b id="inj-tn">大会</b>';
    Object.assign(b0.teams[0], { teamName: XSS_NAME, furigana: NL_NAME, remarks: QUOTE_REMARK,
      paymentMethod: '"><b id="inj-pm">x</b>', rentalInput: '"><b id="inj-ri">x</b>' });
    Object.assign(b0.teams[1], { furigana: '', rep: REP_HTML });
    d.venues[0].blockCount = '<b id="inj-bc">2</b>';
    return d;
  };
  const xssHistory = [{ date: '<b id="inj-date">4/21</b>', time: '10:00', team: '<b id="inj-hteam">T</b>', rep: '<i id="inj-hrep">R</i>',
    email: 'a@example.com', slotCount: '<b id="inj-slot">1</b>', venue: 'V', cwOk: true, emailOk: false, tournamentId: 'T1' }];
  const unrepSheet = '21日 O\'Hara<b id="inj-sn">体育館</b>';
  const fetchMock11 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => xssVenue() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: xssHistory }) },
    { match: u => u.includes('action=getTeamEmail'), response: () => ({ email: 'test@example.com' }) },
    { match: u => u.includes('action=getStaffData'), response: () => {
      const s = sampleStaffData();
      Object.assign(s.staffArea.staff[0], { name: '"><b id="inj-sname">n</b>', breakMin: '"><b id="inj-br">1</b>', checkIn: '"><b id="inj-ci">' });
      s.memberList = ['"><b id="inj-ml">m</b>', '山田太郎'];
      return s;
    } },
    { match: u => u.includes('action=getUnreported'), response: () => ({ unreported: [{ spreadsheetId: 'SS\'X', sheetName: unrepSheet, dateStr: '2026/04/21', blockCount: '<b id="inj-ubc">1</b>' }] }) },
    { match: u => u.includes('action=getVenueBySheet'), response: () => ({ venue: xssVenue().venues[1] }) },
    { match: (u,p) => p && p.bookings, response: (u,p) => ({ ok: true, db: 13, cw: 'OK', email: 'OK', reservationId: p.requestId }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]);
  const dom11 = makeDom(fetchMock11);
  await waitUntil(() => dom11.window.venueData, 2000);
  const w11 = dom11.window, d11 = w11.document;
  const noInj = (root, ids) => ids.filter(id => (root.querySelector ? root.querySelector('#' + id) : null));
  assert('11.1 esc: & < > " \' をすべて実体参照に', w11.esc('<a href="x">\'&') === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;', w11.esc('<a href="x">\'&'));
  assert('11.2 esc: 0 は "0"、null/undefined/空は空文字', w11.esc(0) === '0' && w11.esc(null) === '' && w11.esc(undefined) === '' && w11.esc('') === '');
  assert('11.3 会場一覧: blockCount の HTML を生成しない', noInj(d11, ['inj-bc']).length === 0 && d11.getElementById('venue-list').textContent.indexOf('<b id="inj-bc">2</b>大会') >= 0);
  w11.selectVenue(0);
  assert('11.4 大会一覧: 大会名は文字として表示', !d11.getElementById('inj-tn') && d11.getElementById('tournament-list').textContent.indexOf('<b id="inj-tn">大会</b>') >= 0);
  w11.selectTournament(0);
  const tn11 = d11.querySelector('#team-list .team-name');
  const rn11 = d11.querySelector('#team-list .rep-name');
  assert('11.5 チーム名（記号・全角・タグ）をそのまま表示', tn11 && tn11.textContent === XSS_NAME && !d11.getElementById('inj-team'), tn11 && tn11.textContent);
  assert('11.6 改行・引用符入りの氏名もそのまま表示', rn11 && rn11.textContent === NL_NAME, rn11 && JSON.stringify(rn11.textContent));
  w11.openTeamDetail(0);
  const rem11 = d11.getElementById('bs-remarks');
  assert('11.7 備考（引用符入り）は value に文字として入り、属性を増やさない', rem11.value === QUOTE_REMARK && !rem11.hasAttribute('onfocus') && !rem11.hasAttribute('autofocus'), rem11.outerHTML);
  assert('11.8 受取方法・レンタル内容の HTML を生成しない', noInj(d11, ['inj-pm', 'inj-ri']).length === 0 &&
    d11.getElementById('bs-payment-method').value === '"><b id="inj-pm">x</b>' && d11.getElementById('bs-rental-input').value === '"><b id="inj-ri">x</b>');
  w11.closeBottomSheet();
  w11.goReport();
  await waitUntil(() => w11.selectedVenue.staffArea, 2000);
  await new Promise(r => setTimeout(r, 50));
  assert('11.9 報告画面: 備考 value とスタッフ欄が崩れない', d11.getElementById('rpt-remarks-0-0').value === QUOTE_REMARK &&
    noInj(d11, ['inj-sname', 'inj-br', 'inj-ci', 'inj-ml']).length === 0, noInj(d11, ['inj-sname', 'inj-br', 'inj-ci', 'inj-ml']).join(','));
  const ml11 = Array.from(d11.getElementById('sn-1').options).map(o => o.value);
  assert('11.10 スタッフ候補（引用符入り）が option 値として保持', ml11.indexOf('"><b id="inj-ml">m</b>') >= 0, JSON.stringify(ml11));
  w11.goVenueDashboard();
  w11.goHistoryScreen();
  await waitUntil(() => d11.querySelector('#history-list .history-card'), 2000);
  const hl11 = d11.getElementById('history-list');
  assert('11.11 履歴: 日付・枠数・チーム・代表者の HTML を生成しない', noInj(hl11, ['inj-date', 'inj-slot', 'inj-hteam', 'inj-hrep']).length === 0 &&
    hl11.textContent.indexOf('<b id="inj-date">4/21</b>') >= 0 && hl11.textContent.indexOf('<b id="inj-slot">1</b>枠') >= 0, noInj(hl11, ['inj-date', 'inj-slot', 'inj-hteam', 'inj-hrep']).join(','));
  w11.goAdmin();
  await waitUntil(() => d11.querySelector('#admin-history-list .history-item'), 2000);
  const al11 = d11.getElementById('admin-history-list');
  assert('11.12 管理画面の履歴も同様', noInj(al11, ['inj-date', 'inj-slot', 'inj-hteam']).length === 0 && al11.textContent.indexOf('<b id="inj-date">4/21</b>') >= 0);
  w11.goVenueSelect();
  w11.filterVenues('unreported');
  await waitUntil(() => d11.querySelector('#venue-list .card'), 2000);
  const uc11 = d11.querySelector('#venue-list .card');
  assert('11.13 未報告: シート名・大会数の HTML を生成せず、onclick に文字列を埋め込まない',
    noInj(d11, ['inj-sn', 'inj-ubc']).length === 0 && uc11.getAttribute('onclick') === 'selectUnreportedVenue(0)', uc11 && uc11.getAttribute('onclick'));
  uc11.click();
  await waitUntil(() => fetchMock11.calls.some(c => c.url.indexOf('action=getVenueBySheet') >= 0), 2000);
  await waitUntil(() => w11.selectedVenue && w11.selectedVenue.spreadsheetId === 'SSID_B', 2000); // 応答反映まで待つ
  const vb11 = fetchMock11.calls.find(c => c.url.indexOf('action=getVenueBySheet') >= 0);
  assert('11.14 未報告カード押下で正しい会場（引用符入り）を取得', !!vb11 && vb11.url.indexOf('ssId=' + encodeURIComponent('SS\'X') + '&') >= 0 &&
    vb11.url.indexOf('sheetName=' + encodeURIComponent(unrepSheet)) >= 0, vb11 && vb11.url);
  // 完了画面の代表者名（HTML 入り）
  w11.selectVenue(0);
  w11.selectTournament(0);
  w11.openTeamDetail(1);
  w11.goSokketsu();
  await new Promise(r => setTimeout(r, 50));
  d11.getElementById('sk-staff-name').value = 'テスター';
  d11.getElementById('sk-input-email').value = 'buyer@example.com';
  d11.getElementById('sk-date1').value = '2026-04-22';
  d11.getElementById('sk-venue1').value = '渋谷';
  d11.getElementById('sk-time1').value = '10:00';
  d11.getElementById('sk-level1').value = 'エンジョイ';
  d11.getElementById('sk-price1').value = '17000';
  w11.isSending = false;
  await w11.doSubmitSokketsu();
  await new Promise(r => setTimeout(r, 50));
  const ds11 = d11.getElementById('done-subtitle');
  assert('11.15 完了画面: 代表者名の HTML を生成しない', !d11.getElementById('inj-rep2') && ds11.textContent.indexOf(REP_HTML + 'さんへメール送信済') === 0, ds11.innerHTML);
  assert('11.16 どの画面でも埋め込みスクリプトが実行されていない', w11.__xss === undefined);
  dom11.window.close();

  // ---- TEST 12: R02 拒否応答（stale / invalid_target） ----
  console.log('\n[12] R02: stale / invalid_target 応答の表示');
  let rejectCode12 = 'stale', rejectMsg12 = '再読込してください（チームが見つかりません）';
  const fetchMock12 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getStaffData'), response: () => sampleStaffData() },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => (rejectMsg12 === null ? { success: false, error: rejectCode12 } : { success: false, error: rejectCode12, message: rejectMsg12 }) }
  ]);
  const dom12 = makeDom(fetchMock12);
  await waitUntil(() => dom12.window.venueData, 2000);
  const w12 = dom12.window, d12 = w12.document;
  const banner12 = d12.getElementById('submit-reject-banner');
  assert('12.0 初期は拒否バナー非表示', banner12 && banner12.classList.contains('hidden'));
  w12.selectVenue(0);
  w12.selectTournament(0);
  w12.toggleReception(0);
  await waitUntil(() => !banner12.classList.contains('hidden'), 2000);
  assert('12.1 受付保存が stale → サーバーの message を表示', !banner12.classList.contains('hidden') &&
    d12.getElementById('submit-reject-msg').textContent === '再読込してください（チームが見つかりません）', d12.getElementById('submit-reject-msg').textContent);
  assert('12.2 stale は再読込ボタンを表示（閉じるは出さない）', !d12.getElementById('submit-reject-reload').classList.contains('hidden') &&
    d12.getElementById('submit-reject-close').classList.contains('hidden'));
  const rcPost12 = fetchMock12.calls.filter(c => c.parsed && c.parsed.action === 'submitReport');
  assert('12.3 受付保存で teamKey を送る', rcPost12.length === 1 && rcPost12[0].parsed.teams[0].teamKey === 'T1|A1|チームa', JSON.stringify(rcPost12.map(c => c.parsed.teams)));
  // 自動保存（ボトムシート）は stale なら再送しない
  w12.hideSubmitReject();
  w12.openTeamDetail(1);
  d12.getElementById('bs-remarks').value = '再送しない';
  w12._onBSChange(); // 入力イベント相当（debounce 中に閉じる → 即時送信）
  w12.saveLocalAndClose();
  await waitUntil(() => !banner12.classList.contains('hidden'), 2000);
  await new Promise(r => setTimeout(r, 5400));
  const bsPosts12 = fetchMock12.calls.filter(c => c.parsed && c.parsed.action === 'submitReport' && c.parsed.teams[0].remarks === '再送しない');
  assert('12.4 自動保存が stale → 5秒リトライしない・未保存扱いを維持', bsPosts12.length === 1 && w12.selectedVenue.blocks[0].teams[1]._dirty === true, 'posts=' + bsPosts12.length);
  // 最終報告が stale → 完了画面を出さず、送信ボタンを戻す
  w12.hideSubmitReject();
  w12.goReport();
  await waitUntil(() => w12.selectedVenue.staffArea, 2000);
  await new Promise(r => setTimeout(r, 50));
  d12.getElementById('accident-report').value = '残すべき下書き';
  w12._saveReportLocalStorage();
  w12.isSending = false;
  await w12.doSubmitReport();
  await new Promise(r => setTimeout(r, 50));
  assert('12.5 最終報告が stale → 完了画面を出さない', d12.getElementById('screen-done').classList.contains('hidden') && !d12.getElementById('screen-report').classList.contains('hidden'));
  assert('12.6 最終報告が stale → 送信ボタン再有効・送信中解除・案内表示', d12.getElementById('report-send-btn').disabled === false && w12.isSending === false && !banner12.classList.contains('hidden'));
  assert('12.7 最終報告が stale → 下書きは消さない', w12.localStorage.getItem('rpt_v2_SSID_A_21日 渋谷体育館_accident') === '残すべき下書き');
  // message が無い stale は既定文
  rejectMsg12 = null;
  w12.hideSubmitReject();
  w12.selectTournament(0);
  w12.toggleReception(1);
  await waitUntil(() => !banner12.classList.contains('hidden'), 2000);
  assert('12.7b message なしの stale は既定文', d12.getElementById('submit-reject-msg').textContent === '画面が古くなりました。再読込してください');
  // invalid_target
  rejectCode12 = 'invalid_target'; rejectMsg12 = '対象の会場シートではありません（テスト）。画面を再読込してください';
  w12.hideSubmitReject();
  w12.selectTournament(0);
  w12.toggleReception(0);
  await waitUntil(() => !banner12.classList.contains('hidden'), 2000);
  assert('12.8 invalid_target → サーバーの message と再読込ボタン', d12.getElementById('submit-reject-msg').textContent === '対象の会場シートではありません（テスト）。画面を再読込してください' &&
    !d12.getElementById('submit-reject-reload').classList.contains('hidden'));
  assert('12.9 invalid_target はOKボタンで消せる', !d12.getElementById('submit-reject-close').classList.contains('hidden') && (w12.hideSubmitReject(), banner12.classList.contains('hidden')));
  // invalid_value は OK のみ（再読込は出さない）
  rejectCode12 = 'invalid_value'; rejectMsg12 = '入力値が不正です（休憩）';
  w12.toggleReception(0);
  await waitUntil(() => !banner12.classList.contains('hidden'), 2000);
  assert('12.9b invalid_value → message 表示・OK のみ', d12.getElementById('submit-reject-msg').textContent === '入力値が不正です（休憩）' &&
    d12.getElementById('submit-reject-reload').classList.contains('hidden') && !d12.getElementById('submit-reject-close').classList.contains('hidden'));
  w12.hideSubmitReject();
  // 通常のエラーは従来どおり（バナーを出さない）
  rejectCode12 = 'シミュレート失敗'; rejectMsg12 = 'エラー: シミュレート';
  w12.toggleReception(0);
  await new Promise(r => setTimeout(r, 100));
  assert('12.10 その他のエラーでは拒否バナーを出さない', banner12.classList.contains('hidden'));
  w12.goReport();
  w12.isSending = false;
  await w12.doSubmitReport();
  await new Promise(r => setTimeout(r, 50));
  assert('12.11 最終報告のその他エラー → 完了画面へ移らず報告画面に留まり、送信ボタンを戻す',
    d12.getElementById('screen-done').classList.contains('hidden') && !d12.getElementById('screen-report').classList.contains('hidden') &&
    d12.getElementById('report-send-btn').disabled === false && w12.isSending === false);
  assert('12.12 その他エラーの内容を表示（OK で閉じる・再読込は出さない）',
    d12.getElementById('submit-reject-msg').textContent === '報告を送信できませんでした（エラー: シミュレート）' &&
    d12.getElementById('submit-reject-reload').classList.contains('hidden') && !d12.getElementById('submit-reject-close').classList.contains('hidden'),
    d12.getElementById('submit-reject-msg').textContent);
  dom12.window.close();

  // ---- TEST 13: R18 即決予約の DB 結果・requestId・二重送信防止 ----
  console.log('\n[13] R18: 即決予約 DB失敗で完了画面を出さない・requestId 再送');
  const skSeq13 = [];
  const base13 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getTeamEmail'), response: () => ({ email: 'test@example.com' }) }
  ]);
  const skCalls13 = [];
  const fetch13 = function(url, opts) {
    let parsed = null; try { parsed = JSON.parse(opts && opts.body); } catch (e) {}
    if (parsed && parsed.bookings) {
      skCalls13.push(parsed);
      const step = skSeq13.shift();
      if (step === 'NETWORK') return Promise.reject(new TypeError('Failed to fetch'));
      if (step && step.delay) return new Promise(r => setTimeout(() => r(mockResponse(step.res)), step.delay));
      return Promise.resolve(mockResponse(step || { ok: true, db: 20, cw: 'OK', email: 'OK' }));
    }
    return base13(url, opts);
  };
  const dom13 = makeDom(fetch13);
  await waitUntil(() => dom13.window.venueData, 2000);
  const w13 = dom13.window, d13 = w13.document;
  const fillSk13 = () => {
    d13.getElementById('sk-staff-name').value = 'テスター';
    d13.getElementById('sk-input-email').value = 'buyer@example.com';
    d13.getElementById('sk-date1').value = '2026-04-22';
    d13.getElementById('sk-venue1').value = '渋谷';
    d13.getElementById('sk-time1').value = '10:00';
    d13.getElementById('sk-level1').value = 'エンジョイ';
    d13.getElementById('sk-price1').value = '17000';
  };
  const openSk13 = async () => { w13.selectVenue(0); w13.selectTournament(0); w13.openTeamDetail(0); w13.goSokketsu(); await new Promise(r => setTimeout(r, 30)); fillSk13(); };
  const doneShown13 = () => !d13.getElementById('screen-done').classList.contains('hidden');
  const skErr13 = () => d13.getElementById('sk-submit-error');
  await openSk13();
  // 1回目: DB 失敗
  skSeq13.push({ ok: false, db: 'error', error: 'db_failed', reservationId: 'x', message: '予約を保存できませんでした（テスト）', cw: null, email: null });
  await w13.doSubmitSokketsu();
  const rid13 = skCalls13[0] && skCalls13[0].requestId;
  assert('13.1 DB失敗 → 完了画面を出さない', !doneShown13() && !d13.getElementById('screen-sokketsu').classList.contains('hidden'));
  assert('13.2 DB失敗 → サーバーの message を表示', !skErr13().classList.contains('hidden') && skErr13().textContent === '予約を保存できませんでした（テスト）', skErr13().textContent);
  assert('13.3 DB失敗 → 送信ボタンを戻す', d13.getElementById('sokketsu-send-btn').disabled === false && w13.isSending === false);
  assert('13.4 requestId は UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rid13 || ''), 'actual=' + rid13);
  // 2回目: 通信エラー（結果不明）→ 完了画面を出さず、同じ requestId を保持
  skSeq13.push('NETWORK');
  await w13.doSubmitSokketsu();
  assert('13.5 通信エラー → 完了画面を出さず再送を案内', !doneShown13() && skErr13().textContent.indexOf('通信エラー') === 0, skErr13().textContent);
  assert('13.6 再送は同じ requestId', skCalls13[1] && skCalls13[1].requestId === rid13, skCalls13[1] && skCalls13[1].requestId);
  // 3回目: duplicate（同じ requestId の既存結果）→ 成功扱い
  skSeq13.push({ ok: true, duplicate: true, db: 21, cw: 'OK', email: 'OK', reservationId: rid13 });
  await w13.doSubmitSokketsu();
  assert('13.7 duplicate:true は成功扱いで完了画面', doneShown13() && d13.getElementById('done-title').textContent === '送信完了');
  assert('13.8 3回目も同じ requestId', skCalls13[2] && skCalls13[2].requestId === rid13);
  // 新しい入力は新しい requestId
  await openSk13();
  assert('13.9 新しい入力画面ではエラー表示をリセット', skErr13().classList.contains('hidden') && d13.getElementById('sokketsu-send-btn').disabled === false);
  skSeq13.push({ ok: true, db: 22, cw: 'エラー: テスト', email: 'エラー: テスト' });
  await w13.doSubmitSokketsu();
  assert('13.10 新しい送信は別の requestId', skCalls13[3] && skCalls13[3].requestId && skCalls13[3].requestId !== rid13);
  assert('13.11 DB成功・通知両方失敗は「予約登録OK」（受付失敗と混同しない）', doneShown13() && d13.getElementById('done-title').textContent === '予約登録OK', d13.getElementById('done-title').textContent);
  // ok 欄なし（例: サーバー例外の {error}）は結果不明＝完了画面を出さず再送を案内。同じ内容なら同じ requestId
  await openSk13();
  skSeq13.push({ error: 'サーバー例外（テスト）' });
  await w13.doSubmitSokketsu();
  assert('13.12 結果不明は完了画面を出さず再送を案内', !doneShown13() && skErr13().textContent.indexOf('送信結果を確認できませんでした') === 0, skErr13().textContent);
  const ridUnknown13 = skCalls13[skCalls13.length - 1].requestId;
  skSeq13.push({ ok: true, db: 23, cw: '要確認', email: '要確認' });
  await w13.doSubmitSokketsu();
  assert('13.13 同じ内容の再送は同じ requestId・db が行番号でも ok:true なら成功', skCalls13[skCalls13.length - 1].requestId === ridUnknown13 && doneShown13());
  assert('13.13b 通知が「要確認」→ 失敗と言わず「確認できませんでした」', d13.getElementById('done-title').textContent === '予約登録OK' &&
    d13.getElementById('done-subtitle').textContent === '通知（社内・メール）の送信結果を確認できませんでした', d13.getElementById('done-subtitle').textContent);
  // 保存失敗の後に入力し直したら requestId を作り直す
  await openSk13();
  skSeq13.push({ ok: false, db: 'error', error: 'db_failed', cw: null, email: null });
  await w13.doSubmitSokketsu();
  const ridFail13 = skCalls13[skCalls13.length - 1].requestId;
  assert('13.13a message の無い DB失敗 → 既定文', skErr13().textContent === '少し待って、この画面のまま再送してください。続く場合は管理者へ連絡してください', skErr13().textContent);
  d13.getElementById('sk-venue1').value = '入力し直した会場';
  skSeq13.push({ ok: true, db: 24, cw: 'OK', email: 'スキップ: メールアドレスなし' });
  await w13.doSubmitSokketsu();
  assert('13.13c 入力し直した再送は新しい requestId', skCalls13[skCalls13.length - 1].requestId !== ridFail13);
  assert('13.13d メールがスキップ → 「メール送信済」と言わない', d13.getElementById('done-subtitle').textContent === 'メールなし（アドレス未設定）', d13.getElementById('done-subtitle').textContent);
  // 二重クリック: 応答待ちの間の2回目は送らない
  await openSk13();
  skSeq13.push({ delay: 200, res: { ok: true, db: 25, cw: 'OK', email: 'OK' } });
  const before13 = skCalls13.length;
  const p13a = w13.doSubmitSokketsu();
  const btnDisabled13 = d13.getElementById('sokketsu-send-btn').disabled;
  const p13b = w13.doSubmitSokketsu();
  await Promise.all([p13a, p13b]);
  assert('13.14 送信中はボタン無効', btnDisabled13 === true);
  assert('13.15 二重クリックでも POST は1回', skCalls13.length - before13 === 1, 'posts=' + (skCalls13.length - before13));
  assert('13.16 完了後は requestId を破棄', w13._skRequestId === null);
  // 認証切れ（AUTH_REQUIRED）→ 完了画面を出さず PIN 入力を案内（requestId は保持）
  await openSk13();
  skSeq13.push({ error: 'AUTH_REQUIRED' });
  await w13.doSubmitSokketsu();
  assert('13.17 認証切れ → 完了画面を出さず PIN 入力を案内', !doneShown13() && skErr13().textContent.indexOf('PINの確認が必要です') === 0 &&
    d13.getElementById('pin-gate').style.display === 'flex' && typeof w13._skRequestId === 'string', skErr13().textContent);
  w13.PIN_AUTH.hidePinGate();
  skSeq13.push({ error: 'auth_not_configured', code: 'AUTH_NOT_CONFIGURED', message: 'PIN認証が未設定です。管理者にご連絡ください' });
  await w13.doSubmitSokketsu();
  assert('13.18 PIN 未設定 → 完了画面を出さず管理者連絡を表示', !doneShown13() && skErr13().textContent === 'PIN認証が未設定です。管理者にご連絡ください' &&
    d13.getElementById('submit-reject-msg').textContent === 'PIN認証が未設定です。管理者にご連絡ください', skErr13().textContent);
  // 画面を開き直しても同じ内容なら同じ requestId（realEmail の違いは比較しない）
  const ridKeep13 = w13._skRequestId;
  await openSk13();
  w13.selectedVenue.blocks[0].teams[0].realEmail = 'changed@example.com';
  // busy（保存も通知もしていない）→ 同じ requestId で自動再送。busy×2 の後に成功
  w13.SK_BUSY_RETRY_MS = 40;
  const busyRes13 = { ok: false, db: 'busy', error: 'busy', reservationId: 'x', message: '混み合っています（テスト）' };
  const beforeBusy13 = skCalls13.length;
  skSeq13.push(busyRes13, busyRes13, { ok: true, db: 26, cw: 'OK', email: 'OK' });
  const pBusy13 = w13.doSubmitSokketsu();
  await new Promise(r => setTimeout(r, 10));
  const busyText13 = d13.getElementById('loading-text').textContent;
  const busyOverlay13 = !d13.getElementById('loading-overlay').classList.contains('hidden');
  const busyBtn13 = d13.getElementById('sokketsu-send-btn').disabled;
  await w13.doSubmitSokketsu(); // 自動再送の待機中に押しても送らない
  await pBusy13;
  const busyCalls13 = skCalls13.slice(beforeBusy13);
  assert('13.19 開き直しても同じ内容なら同じ requestId（realEmail は比較しない）', busyCalls13.length > 0 && busyCalls13[0].requestId === ridKeep13,
    (busyCalls13[0] && busyCalls13[0].requestId) + ' / ' + ridKeep13);
  assert('13.20 busy → 「混み合っています。数秒後に自動で再送します」・待機中もボタン無効', busyOverlay13 && busyText13 === '混み合っています。数秒後に自動で再送します' && busyBtn13 === true, busyText13);
  assert('13.21 busy×2 → 同じ requestId で自動再送して成功（待機中の2回目は送らない）', busyCalls13.length === 3 && busyCalls13.every(c => c.requestId === ridKeep13) && doneShown13(),
    'posts=' + busyCalls13.length);
  // busy が続く（初回＋自動再送3回とも busy）→ message を表示し、同じ requestId で手動再送できる状態
  await openSk13();
  d13.getElementById('sk-venue1').value = 'busy が続く会場';
  const beforeEx13 = skCalls13.length;
  const busyEx13 = { ok: false, db: 'busy', error: 'busy', reservationId: 'x', message: '混み合っています。少し待って再送してください（テスト）' };
  skSeq13.push(busyEx13, busyEx13, busyEx13, busyEx13);
  await w13.doSubmitSokketsu();
  const exCalls13 = skCalls13.slice(beforeEx13);
  assert('13.22 busy が続く → 初回＋自動再送3回（計4回・同じ requestId）で止めて message 表示', exCalls13.length === 4 &&
    exCalls13.every(c => c.requestId === exCalls13[0].requestId) && !doneShown13() && skErr13().textContent === '混み合っています。少し待って再送してください（テスト）',
    'posts=' + exCalls13.length + ' / ' + skErr13().textContent);
  assert('13.23 手動再送できる状態（ボタン有効・送信中解除・ローディング解除）', d13.getElementById('sokketsu-send-btn').disabled === false && w13.isSending === false &&
    d13.getElementById('loading-overlay').classList.contains('hidden'));
  skSeq13.push({ ok: true, db: 27, cw: 'OK', email: 'OK' });
  await w13.doSubmitSokketsu();
  assert('13.24 手動再送も同じ requestId で成功', skCalls13[skCalls13.length - 1].requestId === exCalls13[0].requestId && doneShown13());
  dom13.window.close();

  // ---- TEST 14: 既存下書き（teamKey なし）の互換 ----
  console.log('\n[14] R02: 既存の下書きキー互換（teamKey なし下書きも読める）');
  const dom14 = makeDom(makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: (u,p) => p && p.action === 'submitReport', response: () => ({ ok: true }) }
  ]));
  await waitUntil(() => dom14.window.venueData, 2000);
  const w14 = dom14.window;
  const bsKey14 = (row) => 'bs_v1_SSID_A_21日 渋谷体育館_' + row;
  // 旧形式（teamKey なし）: 従来どおり復元される
  w14.localStorage.setItem(bsKey14(100), JSON.stringify({ teamName: 'チームA', teamRow: 100, salesActivity: '即決2', rank: '', remarks: '旧形式', rentalInput: '', remittance: '', paymentMethod: '', receptionStatus: '', savedAt: Date.now() }));
  // 新形式でキー不一致（行が別チームに入れ替わった想定）: 破棄される
  w14.localStorage.setItem(bsKey14(101), JSON.stringify({ teamName: 'チームB', teamRow: 101, teamKey: 'T1|A9|別申請', salesActivity: '即決5', rank: '', remarks: '別チーム', rentalInput: '', remittance: '', paymentMethod: '', receptionStatus: '', savedAt: Date.now() }));
  w14.selectVenue(0);
  const tA14 = w14.selectedVenue.blocks[0].teams[0], tB14 = w14.selectedVenue.blocks[0].teams[1];
  assert('14.1 teamKey なしの既存下書きを復元', tA14.remarks === '旧形式' && tA14.salesActivity === '即決2', JSON.stringify({ r: tA14.remarks, s: tA14.salesActivity }));
  assert('14.2 teamKey 不一致の下書きは適用せず削除', tB14.remarks !== '別チーム' && w14.localStorage.getItem(bsKey14(101)) === null);
  w14.selectTournament(0);
  w14.openTeamDetail(0);
  w14.document.getElementById('bs-remarks').value = '新形式';
  w14._onBSChange();
  const saved14 = JSON.parse(w14.localStorage.getItem(bsKey14(100)) || '{}');
  assert('14.3 下書きキー名は従来どおり・teamKey を併記', saved14.teamKey === 'T1|A1|チームa' && saved14.remarks === '新形式', JSON.stringify(saved14));
  await new Promise(r => setTimeout(r, 50)); // 復元時の自動再送の応答処理を待ってから閉じる
  dom14.window.close();

  // ---- TEST 15: 最終契約（読み取りの invalid_target・PIN 未設定・緊急PINの版・予約IDでのメール再送） ----
  console.log('\n[15] 最終契約: 読み取りエラー表示・PIN 未設定・緊急PIN版・予約IDで再送');
  const rid15 = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const hist15 = [
    { date: '2026/04/21', time: '10:00', team: 'チームA', rep: '山田 太郎', email: 'a@example.com', slotCount: 1, venue: 'V', cwOk: true, emailOk: false, tournamentId: 'T1', reservationId: rid15 },
    { date: '2026/04/21', time: '09:00', team: 'チームB', rep: '鈴木 花子', email: 'b@example.com', slotCount: 1, venue: 'V', cwOk: true, emailOk: false, tournamentId: 'T1', reservationId: '' },
    { date: '2026/04/21', time: '08:00', team: 'チームC', rep: 'C', email: 'c@example.com', slotCount: 1, venue: 'V', cwOk: false, cwDetail: 'エラー: CW', emailOk: false, emailDetail: '要確認', tournamentId: 'T1', reservationId: 'r3' },
    { date: '2026/04/21', time: '07:00', team: 'チームD', rep: 'D', email: 'd@example.com', slotCount: 1, venue: 'V', cwOk: false, cwDetail: '要確認', emailOk: true, emailDetail: 'OK', tournamentId: 'T1', reservationId: 'r4' }
  ];
  let resendAnswer15 = { email: 'OK', reservationId: rid15 };
  const fetchMock15 = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: hist15 }) },
    { match: u => u.includes('action=getStaffData'), response: () => ({ error: 'invalid_target', message: '対象の会場シートではありません（前月より前）。画面を再読込してください' }) },
    { match: u => u.includes('action=getVenueBySheet'), response: () => ({ error: 'invalid_target', message: '対象の会場シートではありません（シートなし）。画面を再読込してください' }) },
    { match: u => u.includes('action=getUnreported'), response: () => ({ unreported: [{ spreadsheetId: 'SSID_Z', sheetName: '21日 別会場', dateStr: '2026/04/21', blockCount: 1 }] }) },
    { match: (u,p) => p && p.action === 'resendEmail', response: () => resendAnswer15 }
  ]);
  const dom15 = makeDom(fetchMock15);
  await waitUntil(() => dom15.window.venueData, 2000);
  const w15 = dom15.window, d15 = w15.document;
  const banner15 = d15.getElementById('submit-reject-banner');
  // getStaffData が invalid_target
  w15.selectVenue(0);
  w15.goReport();
  await waitUntil(() => !banner15.classList.contains('hidden'), 2000);
  assert('15.1 getStaffData の invalid_target → message と再読込ボタン', d15.getElementById('submit-reject-msg').textContent === '対象の会場シートではありません（前月より前）。画面を再読込してください' &&
    !d15.getElementById('submit-reject-reload').classList.contains('hidden') && d15.getElementById('staff-area').textContent === '対象の会場シートではありません（前月より前）。画面を再読込してください');
  // getVenueBySheet が invalid_target
  w15.hideSubmitReject();
  w15.goVenueSelect();
  w15.filterVenues('unreported');
  await waitUntil(() => d15.querySelector('#venue-list .card'), 2000);
  d15.querySelector('#venue-list .card').click();
  await waitUntil(() => !banner15.classList.contains('hidden'), 2000);
  assert('15.2 getVenueBySheet の invalid_target → message と再読込ボタン', d15.getElementById('submit-reject-msg').textContent === '対象の会場シートではありません（シートなし）。画面を再読込してください');
  // メール再送は予約IDだけで送る。旧行（予約IDなし）は送らない
  w15.hideSubmitReject();
  w15.selectVenue(0);
  w15.goHistoryScreen();
  await waitUntil(() => d15.getElementById('resend-1'), 2000);
  const hs15 = (i) => Array.from(d15.querySelectorAll('#history-list .history-card')[i].querySelectorAll('.hc-status')).map(e => e.className.replace('hc-status ', '') + ':' + e.textContent);
  assert('15.2b 履歴: Chatwork 失敗は「社内通知エラー」、要確認は「送信結果 要確認」（「予約登録エラー」と出さない）',
    JSON.stringify(hs15(0)) === JSON.stringify(['ok:✓ 予約登録OK', 'ng:✗ メール送信エラー']) &&
    JSON.stringify(hs15(2)) === JSON.stringify(['ng:✗ 社内通知エラー', 'check:△ メール 送信結果 要確認']) &&
    JSON.stringify(hs15(3)) === JSON.stringify(['check:△ 社内通知 送信結果 要確認', 'ok:✓ メール送信OK']) &&
    d15.getElementById('history-list').textContent.indexOf('予約登録エラー') < 0, JSON.stringify([hs15(2), hs15(3)]));
  await w15.resendEmail(0);
  const rs15 = fetchMock15.calls.filter(c => c.parsed && c.parsed.action === 'resendEmail');
  assert('15.3 再送は {action, reservationId} のみ（予約内容・氏名を送らない）', rs15.length === 1 && rs15[0].parsed.reservationId === rid15 &&
    rs15[0].parsed.rep === undefined && rs15[0].parsed.team === undefined && rs15[0].parsed.bookings === undefined, rs15[0] && rs15[0].body);
  assert('15.4 再送 OK → 「完了」', d15.getElementById('resend-0').textContent === '完了');
  await w15.resendEmail(1);
  assert('15.5 予約IDの無い旧行は送らず「再送不可」', fetchMock15.calls.filter(c => c.parsed && c.parsed.action === 'resendEmail').length === 1 && d15.getElementById('resend-1').textContent === '再送不可');
  resendAnswer15 = { email: 'エラー: 予約が見つかりません', reservationId: rid15, error: 'reservation_not_found' };
  w15.goAdmin();
  await waitUntil(() => d15.getElementById('adm-resend-0'), 2000);
  await w15.adminResend(0);
  assert('15.6 管理画面の再送も予約ID・失敗は「失敗」', d15.getElementById('adm-resend-0').textContent === '失敗' &&
    fetchMock15.calls.filter(c => c.parsed && c.parsed.action === 'resendEmail').pop().parsed.reservationId === rid15);
  dom15.window.close();

  // PIN 未設定（auth_not_configured）→ 管理者連絡の表示
  const dom15b = makeDom(makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => ({ error: 'auth_not_configured', code: 'AUTH_NOT_CONFIGURED', message: 'PIN認証が未設定です。管理者にご連絡ください' }) },
    { match: u => u.includes('action=getClosingList'), response: () => ({ error: 'auth_not_configured', code: 'AUTH_NOT_CONFIGURED', message: 'PIN認証が未設定です。管理者にご連絡ください' }) }
  ]));
  const d15b = dom15b.window.document;
  await waitUntil(() => !d15b.getElementById('submit-reject-banner').classList.contains('hidden'), 2000);
  assert('15.7 PIN 未設定 → 「管理者にご連絡ください」を表示（再読込ボタンなし）', d15b.getElementById('submit-reject-msg').textContent === 'PIN認証が未設定です。管理者にご連絡ください' &&
    d15b.getElementById('submit-reject-reload').classList.contains('hidden') && d15b.getElementById('error-banner').textContent === 'PIN認証が未設定です。管理者にご連絡ください');
  dom15b.window.close();

  // 緊急PINの pinVersion（'EMERGENCY-…' 文字列）をそのまま _v で送る
  const fetchMock15c = makeFetchMock([
    { match: (u,p) => p && p.action === 'verifyPin', response: () => ({ ok: true, token: 'unit-emergency-token', pinVersion: 'EMERGENCY-abcdef123456', expiresAt: Date.now() + 3600000, emergency: true }) },
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) }
  ]);
  const dom15c = makeDom(fetchMock15c);
  await waitUntil(() => dom15c.window.venueData, 2000);
  const w15c = dom15c.window;
  const pr15 = await w15c.PIN_AUTH.submitPin('1234');
  await waitUntil(() => fetchMock15c.calls.filter(c => c.url.indexOf('action=getVenueReport') >= 0).length >= 2, 2000);
  const lastGet15 = fetchMock15c.calls.filter(c => c.url.indexOf('action=getVenueReport') >= 0).pop();
  assert('15.8 緊急PINの版を保存し、_v=EMERGENCY-… で送る', pr15.ok === true && w15c.localStorage.getItem('pinAuth_pinVersion') === 'EMERGENCY-abcdef123456' &&
    lastGet15.url.indexOf('_v=EMERGENCY-abcdef123456') >= 0, lastGet15 && lastGet15.url);
  await new Promise(r => setTimeout(r, 50));
  dom15c.window.close();

  // PIN 入力: busy は RATE_LIMITED と区別し、入力した PIN のまま自動再試行（最大2回）
  let pinAnswers15 = [];
  const fetchMock15d = makeFetchMock([
    { match: (u,p) => p && p.action === 'verifyPin', response: () => pinAnswers15.shift() || { ok: false, error: 'busy', message: '混み合っています' } },
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: [] }) }
  ]);
  const dom15d = makeDom(fetchMock15d);
  await waitUntil(() => dom15d.window.venueData, 2000);
  const w15d = dom15d.window, d15d = w15d.document;
  w15d.PIN_BUSY_RETRY_MS = 30;
  const typePin15 = (pin) => { for (let k = 0; k < 4; k++) d15d.getElementById('pin-d' + k).value = pin[k]; };
  const pinCalls15 = () => fetchMock15d.calls.filter(c => c.parsed && c.parsed.action === 'verifyPin');
  typePin15('1234');
  pinAnswers15 = [{ ok: false, error: 'busy', message: 'x' }, { ok: true, token: 'unit-token-2', pinVersion: 2, expiresAt: Date.now() + 3600000 }];
  await w15d.pinGateSubmit();
  assert('15.9 PIN busy → 同じ PIN で自動再試行して成功', pinCalls15().length === 2 && pinCalls15().every(c => c.parsed.pin === '1234') &&
    w15d.localStorage.getItem('pinAuth_token') === 'unit-token-2', 'calls=' + pinCalls15().length);
  typePin15('5678');
  pinAnswers15 = [];   // 3回とも busy（初回＋自動再試行2回）
  await w15d.pinGateSubmit();
  assert('15.10 PIN busy が続く → 3回で止め、PIN を消さずに混雑の案内（RATE_LIMITED とは別の文言）', pinCalls15().length === 5 &&
    d15d.getElementById('pin-error').textContent === '混み合っています。少し待ってから「確認」を押してください' &&
    [0, 1, 2, 3].map(k => d15d.getElementById('pin-d' + k).value).join('') === '5678' && d15d.getElementById('pin-submit').disabled === false,
    d15d.getElementById('pin-error').textContent);
  pinAnswers15 = [{ ok: false, error: 'RATE_LIMITED' }];
  await w15d.pinGateSubmit();
  assert('15.11 RATE_LIMITED は従来どおり（再試行せず・入力をクリア）', pinCalls15().length === 6 &&
    d15d.getElementById('pin-error').textContent.indexOf('入力回数が多すぎます') === 0 && d15d.getElementById('pin-d0').value === '');
  await new Promise(r => setTimeout(r, 50));
  dom15d.window.close();

  // 満枠取消: getClosingList の reservationId・bookingDate・bookingVenue をそのまま送る。stale なら一覧を再読込
  const closing15 = [{ bookingDate: '5/10', bookingTime: '10:00', bookingLevel: 'エンジョイ', bookingVenue: 'テスト体育館', closedByStaff: 'S', closedDate: '4/21', closedAt: '10:00',
    rowIndex: 7, bookingIndex: 0, reservationId: 'rsv-closing-1' }];
  let cancelAnswer15 = { ok: false, error: 'stale', message: '再読込してください（予約が見つかりません）' };
  const fetchMock15e = makeFetchMock([
    { match: u => u.includes('action=getVenueReport'), response: () => sampleVenueData() },
    { match: u => u.includes('action=getClosingList'), response: () => ({ closings: closing15 }) },
    { match: u => u.includes('action=getHistory'), response: () => ({ items: [] }) },
    { match: (u,p) => p && p.action === 'cancelManpaku', response: () => cancelAnswer15 }
  ]);
  const dom15e = makeDom(fetchMock15e);
  await waitUntil(() => dom15e.window.venueData, 2000);
  const w15e = dom15e.window, d15e = w15e.document;
  w15e.goAdmin();
  await waitUntil(() => d15e.getElementById('cancel-mp-0'), 2000);
  const closingGets15 = () => fetchMock15e.calls.filter(c => c.url.indexOf('action=getClosingList') >= 0).length;
  const beforeGets15 = closingGets15();
  await w15e.cancelManpaku(0);
  const cm15 = fetchMock15e.calls.filter(c => c.parsed && c.parsed.action === 'cancelManpaku');
  assert('15.12 満枠取消は reservationId・bookingDate・bookingVenue をそのまま送る', cm15.length === 1 && cm15[0].parsed.reservationId === 'rsv-closing-1' &&
    cm15[0].parsed.bookingDate === '5/10' && cm15[0].parsed.bookingVenue === 'テスト体育館' && cm15[0].parsed.rowIndex === 7 && cm15[0].parsed.bookingIndex === 0, cm15[0] && cm15[0].body);
  await waitUntil(() => closingGets15() >= beforeGets15 + 2, 2000);
  assert('15.13 stale → 一覧を再読込（管理画面・即決画面の両方）し、message を表示', closingGets15() >= beforeGets15 + 2 &&
    d15e.getElementById('toast').textContent === '再読込してください（予約が見つかりません）', 'gets=' + (closingGets15() - beforeGets15));
  await new Promise(r => setTimeout(r, 50));
  dom15e.window.close();

  // ---- 結果サマリ ----
  console.log('\n\n=== 結果 ===');
  console.log(`合格: ${passed}`);
  console.log(`失敗: ${failed}`);
  console.log(`合計: ${results.length}`);
  if (failed > 0) {
    console.log('\n=== 失敗詳細 ===');
    results.filter(r => !r.ok).forEach(r => console.log('[FAIL] ' + r.name + (r.details ? ': ' + r.details : '')));
    process.exit(1);
  } else {
    console.log('\nすべて合格 ✓');
  }
}

runTests().catch(e => {
  console.error('\n\nFATAL:', e.stack || e);
  process.exit(2);
});

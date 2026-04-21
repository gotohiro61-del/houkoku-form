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
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response))
    });
  };
  fn.calls = calls;
  return fn;
}

function makeDom(fetchMock) {
  const dom = new JSDOM(HTML, {
    url: 'https://gotohiro61-del.github.io/houkoku-form/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
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
              { teamRow: 100, teamName: 'チームA', applicationNo: 'A1', rep: '山田 太郎', furigana: 'ヤマダタロウ', phone: '09011112222', price: '17000', payment: '0', receptionStatus: '' },
              { teamRow: 101, teamName: 'チームB', applicationNo: 'A2', rep: '鈴木 花子', furigana: 'スズキハナコ', phone: '09033334444', price: '17000', payment: '0', receptionStatus: '' }
            ]
          },
          {
            tournamentId: 'T2', tournamentName: '中級大会', startTime: '14:00', level: '中級',
            teams: [
              { teamRow: 200, teamName: 'チームC', applicationNo: 'A3', rep: '佐藤', furigana: 'サトウ', phone: '09055556666', price: '17000', payment: '0', receptionStatus: '' }
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
      staff: [
        { row: 390, name: '', checkIn: '', checkOut: '', breakMin: 0 }
      ],
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
    { match: (u,p) => p && p.action === undefined && p.bookings, response: () => ({ cw: 'OK', email: 'OK' }) }
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
  }
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
  w3.saveLocalAndClose();
  await new Promise(r => setTimeout(r, 50));

  const submitCalls = fetchMock3.calls.filter(c => c.parsed && c.parsed.action === 'submitReport');
  assert('3.1 閉じる時 submitReport 呼ばれる', submitCalls.length === 1);
  if (submitCalls.length) {
    const payload = submitCalls[0].parsed;
    assert('3.2 teamRow 正しく送信', payload.teams[0].teamRow === 100, 'actual=' + payload.teams[0].teamRow);
    assert('3.3 salesActivity 正しく送信', payload.teams[0].salesActivity === '即決1');
    assert('3.4 rank 正しく送信', payload.teams[0].rank === '1位');
    assert('3.5 remarks 正しく送信', payload.teams[0].remarks === 'テスト備考');
  }

  // 同値で再度閉じる → POSTされない（差分検出）
  await new Promise(r => setTimeout(r, 20));
  w3.openTeamDetail(0);
  w3.saveLocalAndClose();
  await new Promise(r => setTimeout(r, 50));
  const submitCalls2 = fetchMock3.calls.filter(c => c.parsed && c.parsed.action === 'submitReport');
  assert('3.6 同値で再度閉じる → POST増えない(差分検出)', submitCalls2.length === 1, 'actual=' + submitCalls2.length);

  // 違う値で閉じる → POSTされる
  w3.openTeamDetail(0);
  w3.document.getElementById('bs-remarks').value = '違う備考';
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

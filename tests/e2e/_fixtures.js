// E2E 共通フィクスチャ: GAS API のモックレスポンス
const sampleVenueData = (opts = {}) => {
  const teamBase = (overrides) => Object.assign({
    receptionStatus: '',
    paymentMethod: opts.autoPaid ? '端末決済' : '',
    remittance: opts.autoPaid ? '17000' : '',
    price: '17000', payment: '0'
  }, overrides);
  return ({
  todayDisplay: '2026/04/21(火)',
  venues: [
    {
      spreadsheetId: 'SSID_A',
      sheetName: '21日 渋谷体育館',
      dayCategory: 'today',
      dateStr: '2026/04/21',
      blockCount: 1,
      completed: false,
      blocks: [
        {
          tournamentId: 'T1',
          tournamentName: 'エンジョイ大会',
          startTime: '10:00',
          level: 'エンジョイ',
          teams: [
            teamBase({
              teamRow: 100, teamKey: 'T1|A1|チームa', teamName: 'チームA', applicationNo: 'A1',
              rep: '山田 太郎', furigana: 'ヤマダタロウ',
              phone: '09011112222'
            }),
            teamBase({
              teamRow: 101, teamKey: 'T1|A2|チームb', teamName: 'チームB', applicationNo: 'A2',
              rep: '鈴木 花子', furigana: 'スズキハナコ',
              phone: '09033334444'
            })
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
          tournamentId: 'T2',
          tournamentName: '別会場大会',
          startTime: '10:00',
          level: 'エンジョイ',
          teams: [
            teamBase({
              teamRow: 200, teamKey: 'T2|B1|チームx', teamName: 'チームX', applicationNo: 'B1',
              rep: '田中', furigana: 'タナカ',
              phone: '09077778888'
            })
          ]
        }
      ]
    }
  ]
});
};

// スタッフ欄（最終契約）: 13枠。slot=0〜12、staffKey=正規化氏名（空き行は ''）。checkKey=R列の項目名
const sampleStaffSlots = () => Array.from({ length: 13 }, (_, k) => ({
  row: 390 + k, slot: k, staffKey: k === 0 ? '山田太郎' : '', name: k === 0 ? '山田太郎' : '',
  checkIn: '', checkOut: '', breakMin: 0
}));
const sampleStaffData = () => ({
  staffArea: {
    staff: sampleStaffSlots(),
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
  overtimeContext: {
    dismissalTimeF12: '', cleanupMin: 35, thresholdMin: 15,
    existingOvertimeReason: ''
  }
});

/**
 * PIN 認証済み状態を作る（テスト用のダミー値。本物のトークンではない）。
 * PIN ゲート導入後は未認証だと loadData が走らないため、各ページ読込前に注入する。
 */
async function seedAuth(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pinAuth_token', 'e2e-dummy-token');
      localStorage.setItem('pinAuth_pinVersion', '1');
      localStorage.setItem('pinAuth_expiresAt', String(Date.now() + 24 * 60 * 60 * 1000));
    } catch (e) {}
  });
}

/** テスト中の外部通信を遮断（localhost と route モック済みの GAS 以外）。 */
async function blockExternal(page) {
  await page.route(
    (url) => !/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url.href) && !url.href.startsWith('https://script.google.com/'),
    (route) => route.abort()
  );
}

/**
 * GAS API モックをセットアップ。
 * capturedPosts: POST ペイロードを記録する配列（テスト側で assertion）
 * customResponses: パターン別に応答を差し替える（失敗ケース等）
 */
async function setupApiMock(page, options = {}) {
  const capturedPosts = [];
  const customResponses = options.customResponses || [];
  const submitReportResponse = options.submitReportResponse || { success: true, teamsUpdated: 1, staffUpdated: 0, message: 'テスト更新' };
  // 即決予約の既定応答（最終契約: ok:true、db は行番号、reservationId は requestId と同じ）
  const sokketsuResponse = options.sokketsuResponse || ((url, parsed) => ({
    ok: true, db: 101, cw: 'OK', email: 'OK', reservationId: (parsed && parsed.requestId) || 'RSV-E2E-0001'
  }));
  const resolve = (v, url, parsed, method) => (typeof v === 'function' ? v(url, parsed, method) : v);

  await seedAuth(page);
  await blockExternal(page);
  await page.route('https://script.google.com/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    let bodyText = '';
    let parsed = null;
    if (method === 'POST') {
      bodyText = req.postData() || '';
      try { parsed = JSON.parse(bodyText); } catch (e) {}
      capturedPosts.push({ url, body: bodyText, parsed });
    }

    // カスタムハンドラ優先
    for (const h of customResponses) {
      if (h.match(url, parsed, method)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(h.response(url, parsed, method))
        });
      }
    }

    // デフォルトマッピング
    let body;
    if (method === 'GET') {
      if (url.includes('action=getVenueReport')) body = sampleVenueData({ autoPaid: !!options.autoPaid });
      else if (url.includes('action=getClosingList')) body = { closings: [] };
      else if (url.includes('action=getStaffData')) body = sampleStaffData();
      else if (url.includes('action=getHistory')) body = { items: [] };
      else if (url.includes('action=getTeamEmail')) body = { email: 'test@example.com' };
      else if (url.includes('action=getUnreported')) body = { unreported: [] };
      else body = {};
    } else {
      // POST
      if (parsed && parsed.action === 'submitReport') body = resolve(submitReportResponse, url, parsed, method);
      else if (parsed && parsed.bookings) body = resolve(sokketsuResponse, url, parsed, method);
      else body = { ok: true };
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });

  return { capturedPosts };
}

module.exports = { setupApiMock, sampleVenueData, sampleStaffData, seedAuth, blockExternal };

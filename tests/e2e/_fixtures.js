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
              teamRow: 100, teamName: 'チームA', applicationNo: 'A1',
              rep: '山田 太郎', furigana: 'ヤマダタロウ',
              phone: '09011112222'
            }),
            teamBase({
              teamRow: 101, teamName: 'チームB', applicationNo: 'A2',
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
              teamRow: 200, teamName: 'チームX', applicationNo: 'B1',
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

const sampleStaffData = () => ({
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
  overtimeContext: {
    dismissalTimeF12: '', cleanupMin: 35, thresholdMin: 15,
    existingOvertimeReason: ''
  }
});

/**
 * GAS API モックをセットアップ。
 * capturedPosts: POST ペイロードを記録する配列（テスト側で assertion）
 * customResponses: パターン別に応答を差し替える（失敗ケース等）
 */
async function setupApiMock(page, options = {}) {
  const capturedPosts = [];
  const customResponses = options.customResponses || [];
  const submitReportResponse = options.submitReportResponse || { ok: true };
  const sokketsuResponse = options.sokketsuResponse || { cw: 'OK', email: 'OK' };

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
      if (parsed && parsed.action === 'submitReport') body = submitReportResponse;
      else if (parsed && parsed.bookings) body = sokketsuResponse;
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

module.exports = { setupApiMock, sampleVenueData, sampleStaffData };

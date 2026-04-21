// S6: 会場一覧カードに最終大会の終了予定時刻「〜HH:MM」が表示されるか
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

test.describe('会場一覧の終了予定時刻表示', () => {
  test('計算可能な会場は「〜HH:MM」が表示される', async ({ page }) => {
    // fixture はデフォルトで 大会1=1チーム（テーブル外）
    // → カスタムフィクスチャで計算可能な状態を作る
    await page.route('https://script.google.com/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('action=getVenueReport')) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            todayDisplay: '2026/04/21(火)',
            venues: [
              {
                spreadsheetId: 'SS_TEST',
                sheetName: '21日 テスト体育館',
                dayCategory: 'today',
                dateStr: '2026/04/21',
                blockCount: 1,
                completed: false,
                blocks: [
                  {
                    tournamentId: 'T1',
                    tournamentName: 'ミドルエンジョイ',  // ハーフ判定
                    startTime: '10:00',
                    teams: [
                      { teamName: 'A' }, { teamName: 'B' }, { teamName: 'C' },
                      { teamName: 'D' }, { teamName: 'E' }
                    ]  // 5チーム
                    // ハーフ×5 = 175分 → 10:00+175 = 12:55
                  }
                ]
              },
              {
                spreadsheetId: 'SS_4Q',
                sheetName: '21日 4Q会場',
                dayCategory: 'today',
                dateStr: '2026/04/21',
                blockCount: 1,
                completed: false,
                blocks: [
                  {
                    tournamentId: 'T2',
                    tournamentName: '4Q BATTLE vol.1',  // 4Q判定
                    startTime: '13:00',
                    teams: [
                      { teamName: 'X' }, { teamName: 'Y' }, { teamName: 'Z' }, { teamName: 'W' }
                    ]  // 4チーム → 4Q×4 = 155分 → 13:00+155 = 15:35
                  }
                ]
              },
              {
                spreadsheetId: 'SS_3x3',
                sheetName: '21日 3x3会場',
                dayCategory: 'today',
                dateStr: '2026/04/21',
                blockCount: 1,
                completed: false,
                blocks: [
                  {
                    tournamentId: 'T3',
                    tournamentName: '3x3 CHAMPIONSHIP',
                    startTime: '14:00',
                    teams: Array.from({ length: 6 }, (_, i) => ({ teamName: 'T' + i }))
                    // 3x3×6 = 150分 → 14:00+150 = 16:30
                  }
                ]
              },
              {
                spreadsheetId: 'SS_OUT',
                sheetName: '21日 テーブル外',
                dayCategory: 'today',
                dateStr: '2026/04/21',
                blockCount: 1,
                completed: false,
                blocks: [
                  {
                    tournamentId: 'T4',
                    tournamentName: 'エンジョイ',
                    startTime: '10:00',
                    teams: [{ teamName: 'A' }]  // 1チーム → テーブル外
                  }
                ]
              }
            ]
          })
        });
      } else if (url.includes('action=getClosingList')) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ closings: [] })
        });
      }
      return route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('index.html');
    await page.waitForSelector('#venue-list .card');

    // 各会場カードの内容を確認
    const cards = page.locator('#venue-list .card');
    const count = await cards.count();
    expect(count).toBe(4);

    // カード0: ハーフ×5 → 〜12:55
    const card0Text = await cards.nth(0).textContent();
    expect(card0Text).toContain('テスト体育館');
    expect(card0Text).toContain('〜12:55');

    // カード1: 4Q×4 → 〜15:35
    const card1Text = await cards.nth(1).textContent();
    expect(card1Text).toContain('4Q会場');
    expect(card1Text).toContain('〜15:35');

    // カード2: 3x3×6 → 〜16:30
    const card2Text = await cards.nth(2).textContent();
    expect(card2Text).toContain('3x3会場');
    expect(card2Text).toContain('〜16:30');

    // カード3: テーブル外 → 時刻表示なし
    const card3Text = await cards.nth(3).textContent();
    expect(card3Text).toContain('テーブル外');
    expect(card3Text).not.toContain('〜');
  });
});

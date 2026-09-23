// S9 (R17): サーバー由来の文字列を HTML として解釈しない（実ブラウザでイベント属性が発火しないこと）
const { test, expect } = require('@playwright/test');
const { setupApiMock, sampleVenueData, sampleStaffData } = require('./_fixtures');

const PAGES = ['index.html', 'dashboard.html'];
const XSS_TEAM = '<img src=x onerror="window.__xss=\'team\'">"\'&＜全角＞チーム';
const XSS_REMARK = '" autofocus onfocus="window.__xss=\'remark\'" x="';
const NL_REP = '山田\n太郎 O\'Brien "Bob" ＆記号';
const XSS_REP = '<img src=x onerror="window.__xss=\'rep\'">代表';
const XSS_SHEET = '21日 O\'Hara<img src=x onerror="window.__xss=\'sheet\'">体育館';

function xssVenueData() {
  const d = sampleVenueData({ autoPaid: true });
  const b0 = d.venues[0].blocks[0];
  b0.tournamentName = '<img src=x onerror="window.__xss=\'tn\'">大会';
  Object.assign(b0.teams[0], { teamName: XSS_TEAM, furigana: NL_REP, remarks: XSS_REMARK,
    rentalInput: '"><img src=x onerror="window.__xss=\'rental\'">' });
  Object.assign(b0.teams[1], { furigana: '', rep: XSS_REP });
  d.venues[0].blockCount = '<img src=x onerror="window.__xss=\'bc\'">';
  return d;
}
const xssHistory = [{
  date: '<img src=x onerror="window.__xss=\'date\'">', time: '10:00', team: 'T', rep: 'R', email: 'a@example.com',
  slotCount: '<img src=x onerror="window.__xss=\'slot\'">', venue: 'V', cwOk: true, emailOk: false, tournamentId: 'T1'
}];

for (const pageFile of PAGES) {
  test(`R17 特殊文字を文字として表示し、埋め込みが実行されない (${pageFile})`, async ({ page }) => {
    await setupApiMock(page, {
      customResponses: [
        { match: (url) => url.includes('action=getVenueReport'), response: () => xssVenueData() },
        { match: (url) => url.includes('action=getHistory'), response: () => ({ items: xssHistory }) },
        { match: (url) => url.includes('action=getStaffData'), response: () => {
          const s = sampleStaffData();
          s.staffArea.staff[0].breakMin = '"><img src=x onerror="window.__xss=\'break\'">';
          s.memberList = ['"><img src=x onerror="window.__xss=\'member\'">', '山田太郎'];
          return s;
        } },
        { match: (url) => url.includes('action=getUnreported'), response: () => ({
          unreported: [{ spreadsheetId: 'SSID_A', sheetName: XSS_SHEET, dateStr: '2026/04/21', blockCount: 1 }] }) },
        { match: (url) => url.includes('action=getVenueBySheet'), response: () => ({ venue: sampleVenueData().venues[1] }) }
      ]
    });
    await page.goto('/' + pageFile);

    // 会場一覧 → 大会一覧 → チーム一覧
    await expect(page.locator('#venue-list .card').first()).toBeVisible();
    await page.locator('#venue-list .card').first().click();
    await expect(page.locator('#tournament-list .card-name').first()).toHaveText('<img src=x onerror="window.__xss=\'tn\'">大会');
    await page.locator('#tournament-list .card').first().click();
    expect(await page.locator('#team-list .team-name').first().textContent()).toBe(XSS_TEAM);
    expect(await page.locator('#team-list .rep-name').first().textContent()).toBe(NL_REP);
    expect(await page.locator('#team-list .rep-name').nth(1).textContent()).toBe(XSS_REP);

    // ボトムシート（value 属性に入る値）
    await page.locator('#team-list .team-card').first().click();
    await expect(page.locator('#bs-remarks')).toHaveValue(XSS_REMARK);
    await expect(page.locator('#bs-rental-input')).toHaveValue('"><img src=x onerror="window.__xss=\'rental\'">');
    expect(await page.locator('#bs-remarks').getAttribute('onfocus')).toBeNull();
    await page.locator('#bs-remarks').focus();
    await page.getByRole('button', { name: '閉じる' }).last().click();

    // 報告画面（備考 value・スタッフ欄）
    await page.locator('.back-btn:has-text("大会一覧")').click();
    await page.evaluate(() => goReport());
    await expect(page.locator('#rpt-remarks-0-0')).toHaveValue(XSS_REMARK);
    await expect(page.locator('#sn-1 option').nth(1)).toHaveAttribute('value', '"><img src=x onerror="window.__xss=\'member\'">');

    // 履歴・管理画面
    await page.evaluate(() => goHistoryScreen());
    await expect(page.locator('#history-list .history-card')).toHaveCount(1);
    await expect(page.locator('#history-list')).toContainText('<img src=x onerror="window.__xss=\'slot\'">枠');
    await page.evaluate(() => goAdmin());
    await expect(page.locator('#admin-history-list .history-item')).toHaveCount(1);

    // 未報告一覧（引用符入りシート名）→ 押すと正しい会場を取得
    await page.evaluate(() => { goVenueSelect(); filterVenues('unreported'); });
    const uc = page.locator('#venue-list .card').first();
    await expect(uc).toHaveAttribute('onclick', 'selectUnreportedVenue(0)');
    const [vbReq] = await Promise.all([
      page.waitForRequest(r => r.url().includes('action=getVenueBySheet')),
      uc.click()
    ]);
    expect(new URL(vbReq.url()).searchParams.get('sheetName')).toBe(XSS_SHEET);
    await expect(page.locator('#screen-venue-dashboard')).toBeVisible();

    // 画像読込エラーのイベントが確実に処理される時間を置いてから判定
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
}

test('R17 完了画面の代表者名（HTML 入り）を文字として表示', async ({ page }) => {
  await setupApiMock(page, {
    customResponses: [
      { match: (url) => url.includes('action=getVenueReport'), response: () => xssVenueData() }
    ]
  });
  await page.goto('/index.html');
  await page.locator('#venue-list .card').first().click();
  await page.locator('#tournament-list .card').first().click();
  await page.locator('#team-list .team-card').nth(1).click();
  await page.getByRole('button', { name: '即決予約' }).click();
  await page.locator('#sk-staff-name').fill('E2Eテスター');
  await page.locator('#sk-date1').fill('2026-04-22');
  await page.locator('#sk-venue1').fill('テスト体育館');
  await page.locator('#sk-time1').fill('10:00');
  await page.locator('#sk-level1').fill('エンジョイ');
  await page.locator('#sk-price1').fill('17000');
  await page.locator('button.btn-primary:has-text("確認画面へ")').click();
  await page.locator('#sokketsu-send-btn').click();
  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-subtitle')).toContainText(XSS_REP + 'さんへメール送信済');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('#done-subtitle img').count()).toBe(0);
});

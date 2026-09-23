// S7 (R02): 拒否応答（stale / invalid_target / invalid_value）の表示と、キー（teamKey / staffKey+slot / checkKey）送信
const { test, expect } = require('@playwright/test');
const { setupApiMock, sampleStaffData } = require('./_fixtures');

const PAGES = ['index.html', 'dashboard.html'];
const STALE_MSG = '再読込してください（チームが見つかりません）';
const TARGET_MSG = '対象の会場シートではありません（テスト）。画面を再読込してください';

// 会場 → 全大会の全チームを受付済みにして報告画面へ（autoPaid 前提）
async function openReport(page) {
  await page.locator('#venue-list .card').first().click();
  const cards = page.locator('#tournament-list .card');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click();
    const rc = page.locator('#team-list .rc-area');
    const m = await rc.count();
    for (let j = 0; j < m; j++) { await rc.nth(j).click(); await page.waitForTimeout(50); }
    await page.locator('.back-btn:has-text("大会一覧")').click();
  }
  await expect(page.locator('#report-btn-dash')).toBeEnabled({ timeout: 3000 });
  await page.locator('#report-btn-dash').click();
  await expect(page.locator('#screen-report')).toBeVisible();
  await expect(page.locator('#chk-0')).toBeVisible();
}

async function fillReport(page, pageFile) {
  await page.locator('#report-staff-name').fill('E2E報告者');
  const sales = page.locator('select[id^="rpt-sales-"]');
  const sc = await sales.count();
  for (let i = 0; i < sc; i++) await sales.nth(i).selectOption('なし');
  await page.locator('#chk-0').check();
  await page.locator('#chk-1').check();
  if (pageFile === 'index.html') await page.locator('#final-game-end-time').fill('17:00');
}

for (const pageFile of PAGES) {
  test.describe(`R02 拒否応答 (${pageFile})`, () => {
    test('受付保存が stale → サーバーの message と再読込ボタン → 押すと再読込', async ({ page }) => {
      const { capturedPosts } = await setupApiMock(page, {
        submitReportResponse: { success: false, error: 'stale', message: STALE_MSG }
      });
      await page.goto('/' + pageFile);
      await page.locator('#venue-list .card').first().click();
      await page.locator('#tournament-list .card').first().click();
      await page.locator('#team-list .rc-area').first().click();

      const banner = page.locator('#submit-reject-banner');
      await expect(banner).toBeVisible();
      await expect(page.locator('#submit-reject-msg')).toHaveText(STALE_MSG);
      await expect(page.locator('#submit-reject-reload')).toBeVisible();
      await expect(page.locator('#submit-reject-close')).toBeHidden();

      const post = capturedPosts.find(p => p.parsed && p.parsed.action === 'submitReport');
      expect(post.parsed.teams[0].teamKey).toBe('T1|A1|チームa');
      expect(post.parsed.teams[0].receptionStatus).toBe('checked');

      await Promise.all([page.waitForEvent('load'), page.locator('#submit-reject-reload').click()]);
      await expect(page.locator('#venue-list .card').first()).toBeVisible();
      await expect(banner).toBeHidden();
    });

    test('最終報告が stale → 完了画面を出さず送信ボタンを戻す。staffKey+slot・checkKey(+row ヒント) を送る', async ({ page }) => {
      const { capturedPosts } = await setupApiMock(page, {
        autoPaid: true,
        submitReportResponse: (url, parsed) => (parsed.markComplete
          ? { success: false, error: 'stale', message: STALE_MSG }
          : { success: true, teamsUpdated: 1, staffUpdated: 0, message: 'ok' })
      });
      await page.goto('/' + pageFile);
      await openReport(page);
      await fillReport(page, pageFile);
      await page.locator('#screen-report .report-btn').click();
      await expect(page.locator('#report-confirm-overlay')).toHaveClass(/show/);
      await page.locator('#report-send-btn').click();

      await expect(page.locator('#submit-reject-banner')).toBeVisible();
      await expect(page.locator('#submit-reject-msg')).toHaveText(STALE_MSG);
      await expect(page.locator('#screen-done')).toBeHidden();
      await expect(page.locator('#screen-report')).toBeVisible();
      await expect(page.locator('#report-send-btn')).toBeEnabled();

      const final = capturedPosts.filter(p => p.parsed && p.parsed.action === 'submitReport' && p.parsed.markComplete === true);
      expect(final.length).toBe(1);
      const pl = final[0].parsed;
      expect(pl.teams.map(t => t.teamKey)).toEqual(['T1|A1|チームa', 'T1|A2|チームb']);
      expect(pl.staffList.length).toBe(13);
      expect(pl.staffList.map(s => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(pl.staffList[0].staffKey).toBe('山田太郎');
      expect(pl.staffList[0].name).toBe('山田太郎');
      expect(pl.staffList.slice(1).every(s => s.staffKey === '' && s.name === '')).toBe(true);
      expect(pl.staffList.every(s => !('row' in s) && typeof s.breakMin === 'number')).toBe(true);
      expect(pl.checkItems).toEqual([{ checkKey: 'ゴミ回収', row: 500, checked: true }, { checkKey: '鍵返却', row: 501, checked: true }]); // row は照合ヒント
      expect(pl.markComplete).toBe(true);
    });

    test('invalid_target → サーバーの message、再読込と OK', async ({ page }) => {
      await setupApiMock(page, {
        submitReportResponse: { success: false, error: 'invalid_target', message: TARGET_MSG }
      });
      await page.goto('/' + pageFile);
      await page.locator('#venue-list .card').first().click();
      await page.locator('#tournament-list .card').first().click();
      await page.locator('#team-list .rc-area').first().click();

      await expect(page.locator('#submit-reject-msg')).toHaveText(TARGET_MSG);
      await expect(page.locator('#submit-reject-reload')).toBeVisible();
      await expect(page.locator('#submit-reject-close')).toBeVisible();
      await page.locator('#submit-reject-close').click();
      await expect(page.locator('#submit-reject-banner')).toBeHidden();
    });
  });
}

test('invalid_value → サーバーの message、OK のみ（再読込は出さない）・報告画面に留まる', async ({ page }) => {
  await setupApiMock(page, {
    autoPaid: true,
    submitReportResponse: (url, parsed) => (parsed.markComplete
      ? { success: false, error: 'invalid_value', message: '入力値が不正です（休憩）' }
      : { success: true, teamsUpdated: 1, staffUpdated: 0, message: 'ok' })
  });
  await page.goto('/index.html');
  await openReport(page);
  await fillReport(page, 'index.html');
  await page.locator('#screen-report .report-btn').click();
  await page.locator('#report-send-btn').click();
  await expect(page.locator('#submit-reject-msg')).toHaveText('入力値が不正です（休憩）');
  await expect(page.locator('#submit-reject-reload')).toBeHidden();
  await expect(page.locator('#submit-reject-close')).toBeVisible();
  await expect(page.locator('#screen-done')).toBeHidden();
  await expect(page.locator('#screen-report')).toBeVisible();
});

test('スタッフ行がサーバーに無い位置へ名前を入れたら送信前に止める（行番号を作らない）', async ({ page }) => {
  const { capturedPosts } = await setupApiMock(page, {
    autoPaid: true,
    customResponses: [{
      match: (url) => url.includes('action=getStaffData'),
      response: () => { const s = sampleStaffData(); s.staffArea.staff = s.staffArea.staff.slice(0, 1); return s; }
    }]
  });
  await page.goto('/index.html');
  await openReport(page);
  await fillReport(page, 'index.html');
  // サーバーのスタッフ行は1行だけ。2行目に名前を入れる
  await page.locator('#sn-1').selectOption('鈴木花子');

  let dialogMsg = '';
  page.once('dialog', async (d) => { dialogMsg = d.message(); await d.accept(); });
  await page.locator('#screen-report .report-btn').click();
  await expect.poll(() => dialogMsg).toContain('スタッフ2行目は保存先がありません');
  await expect(page.locator('#report-confirm-overlay')).not.toHaveClass(/show/);
  expect(capturedPosts.filter(p => p.parsed && p.parsed.markComplete === true).length).toBe(0);
});

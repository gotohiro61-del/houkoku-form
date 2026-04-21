// S3: 報告画面の DOM 保持（ダッシュボード戻る→再入で値保持）
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

test.describe('報告画面 DOM保持', () => {
  test('入力→ダッシュボード戻る→再入で値保持', async ({ page }) => {
    await setupApiMock(page, { autoPaid: true });
    await page.goto('/index.html');

    // 会場 → 大会 → 受付完了して報告画面へ
    await page.locator('#venue-list .card').first().click();

    // 全チーム受付チェック（報告ボタン有効化のため）
    const teamCards = page.locator('#tournament-list .card');
    const tournamentCount = await teamCards.count();
    for (let i = 0; i < tournamentCount; i++) {
      await teamCards.nth(i).click();
      const rcAreas = page.locator('#team-list .rc-area');
      const n = await rcAreas.count();
      for (let j = 0; j < n; j++) {
        await rcAreas.nth(j).click();
        await page.waitForTimeout(50);
      }
      await page.locator('.back-btn:has-text("大会一覧")').click();
    }

    // 報告ボタンクリック
    const reportBtn = page.locator('#report-btn-dash');
    await expect(reportBtn).toBeEnabled({ timeout: 3000 });
    await reportBtn.click();
    await expect(page.locator('#screen-report')).toBeVisible();

    // 入力
    await page.locator('#report-staff-name').fill('E2E太郎');
    await page.locator('#accident-report').fill('テストアクシデント');
    await page.locator('#other-report').fill('テストその他');

    // ダッシュボードへ戻る
    await page.locator('#screen-report .back-btn').click();
    await expect(page.locator('#screen-venue-dashboard')).toBeVisible();

    // 再度報告画面
    await reportBtn.click();
    await expect(page.locator('#screen-report')).toBeVisible();

    // 値保持確認
    expect(await page.locator('#report-staff-name').inputValue()).toBe('E2E太郎');
    expect(await page.locator('#accident-report').inputValue()).toBe('テストアクシデント');
    expect(await page.locator('#other-report').inputValue()).toBe('テストその他');
  });
});

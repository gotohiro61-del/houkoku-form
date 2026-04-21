// S4: 下書きバナー表示・使う・破棄
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

test.describe('下書きバナー', () => {
  test('昨日の下書き → バナー表示 → 使う で復元', async ({ page }) => {
    await setupApiMock(page, { autoPaid: true });
    await page.goto('/index.html');
    // 事前に localStorage に昨日の下書きを注入
    await page.evaluate(() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const prefix = 'rpt_v2_SSID_A_21日 渋谷体育館_';
      localStorage.setItem(prefix + '_meta', JSON.stringify({
        savedAt: yesterday.toISOString(),
        sheetDate: '2026/04/20',
        version: 2
      }));
      localStorage.setItem(prefix + 'accident', '昨日のアクシデント');
      localStorage.setItem(prefix + 'other', '昨日のその他');
      localStorage.setItem(prefix + 'staff', '昨日の太郎');
    });
    await page.reload();

    // 会場→大会→受付→報告画面まで進む（受付チェックが必要）
    await page.locator('#venue-list .card').first().click();
    const teamCards = page.locator('#tournament-list .card');
    const tc = await teamCards.count();
    for (let i = 0; i < tc; i++) {
      await teamCards.nth(i).click();
      const n = await page.locator('#team-list .rc-area').count();
      for (let j = 0; j < n; j++) {
        await page.locator('#team-list .rc-area').nth(j).click();
        await page.waitForTimeout(50);
      }
      await page.locator('.back-btn:has-text("大会一覧")').click();
    }
    await page.locator('#report-btn-dash').click();

    // バナー表示確認
    const banner = page.locator('#draft-banner');
    await expect(banner).toBeVisible({ timeout: 3000 });
    const msg = await page.locator('#draft-banner-msg').textContent();
    expect(msg).toMatch(/\d+月\d+日/);

    // 「使う」をクリック → 復元
    await page.locator('button:has-text("下書きを使う")').click();
    await expect(banner).toBeHidden();
    expect(await page.locator('#accident-report').inputValue()).toBe('昨日のアクシデント');
    expect(await page.locator('#other-report').inputValue()).toBe('昨日のその他');
    expect(await page.locator('#report-staff-name').inputValue()).toBe('昨日の太郎');
  });

  test('昨日の下書き → バナー表示 → 破棄 で削除', async ({ page }) => {
    await setupApiMock(page, { autoPaid: true });
    await page.goto('/index.html');
    await page.evaluate(() => {
      const y = new Date(); y.setDate(y.getDate() - 2);
      const prefix = 'rpt_v2_SSID_A_21日 渋谷体育館_';
      localStorage.setItem(prefix + '_meta', JSON.stringify({ savedAt: y.toISOString(), version: 2 }));
      localStorage.setItem(prefix + 'accident', '古いデータ');
    });
    await page.reload();

    await page.locator('#venue-list .card').first().click();
    const teamCards = page.locator('#tournament-list .card');
    const tc = await teamCards.count();
    for (let i = 0; i < tc; i++) {
      await teamCards.nth(i).click();
      const n = await page.locator('#team-list .rc-area').count();
      for (let j = 0; j < n; j++) {
        await page.locator('#team-list .rc-area').nth(j).click();
        await page.waitForTimeout(50);
      }
      await page.locator('.back-btn:has-text("大会一覧")').click();
    }
    await page.locator('#report-btn-dash').click();

    const banner = page.locator('#draft-banner');
    await expect(banner).toBeVisible();

    await page.locator('button:has-text("破棄する")').click();
    await expect(banner).toBeHidden();

    // localStorage クリア確認
    const remaining = await page.evaluate(() => {
      const prefix = 'rpt_v2_SSID_A_21日 渋谷体育館_';
      return localStorage.getItem(prefix + 'accident');
    });
    expect(remaining).toBeNull();
  });
});

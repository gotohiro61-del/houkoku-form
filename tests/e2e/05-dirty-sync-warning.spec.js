// S5: 未保存（dirty）時の「最新に更新」警告 + バッジ表示
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

test.describe('dirty 状態の更新警告', () => {
  test('保存失敗時 dirty バッジ表示、更新で confirm', async ({ page }) => {
    // submitReport が常に失敗を返す
    await setupApiMock(page, {
      customResponses: [
        {
          match: (url, parsed, method) =>
            method === 'POST' && parsed && parsed.action === 'submitReport',
          response: () => ({ error: 'シミュレート失敗' })
        }
      ]
    });
    await page.goto('/index.html');

    await page.locator('#venue-list .card').first().click();
    await page.locator('#tournament-list .card').first().click();
    await page.locator('#team-list .team-card').first().click();

    // ボトムシートで入力→閉じる（失敗する）
    await page.locator('#bs-sales').selectOption('即決1');
    await page.locator('button:has-text("閉じる")').last().click();
    await page.waitForTimeout(700);

    // dirty バッジ表示確認
    const badge = page.locator('#sync-btn .dirty-badge');
    await expect(badge).toBeVisible({ timeout: 3000 });
    const badgeText = await badge.textContent();
    expect(badgeText).toMatch(/未保存1/);

    // 「最新に更新」クリック → confirm ダイアログ（Playwright で dialog をリッスン）
    let dialogShown = false;
    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogShown = true;
      dialogMessage = dialog.message();
      await dialog.dismiss(); // キャンセル
    });
    await page.locator('#sync-btn').click();
    await page.waitForTimeout(500);

    expect(dialogShown).toBe(true);
    expect(dialogMessage).toMatch(/未保存/);
  });
});

// S2: ボトムシート自動保存 + 差分検出
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

test.describe('チーム受付 自動保存', () => {
  test('閉じる時に POST 送信、同値で再度閉じても POST 増えない、値変更で POST', async ({ page }) => {
    const { capturedPosts } = await setupApiMock(page);
    await page.goto('/index.html');

    // 会場 → 大会 → チーム
    await page.locator('#venue-list .card').first().click();
    await page.locator('#tournament-list .card').first().click();
    await page.locator('#team-list .team-card').first().click();

    // ボトムシートで入力
    await page.locator('#bs-sales').selectOption('即決1');
    await page.locator('#bs-rank').selectOption('1位');
    await page.locator('#bs-remarks').fill('テスト備考');

    // 「閉じる」（左側の灰色ボタン、saveLocalAndClose を発火）
    await page.locator('.bs-sheet button:has-text("閉じる"), button:has-text("閉じる")').last().click();

    // POST 発生確認（fire-and-forget なので少し待つ）
    await page.waitForTimeout(500);
    const submits1 = capturedPosts.filter(p => p.parsed && p.parsed.action === 'submitReport');
    expect(submits1.length).toBe(1);
    expect(submits1[0].parsed.teams[0].salesActivity).toBe('即決1');
    expect(submits1[0].parsed.teams[0].rank).toBe('1位');
    expect(submits1[0].parsed.teams[0].remarks).toBe('テスト備考');

    // 同値で再度開いて閉じる → POST 増えない
    await page.locator('#team-list .team-card').first().click();
    await page.locator('button:has-text("閉じる")').last().click();
    await page.waitForTimeout(300);
    const submits2 = capturedPosts.filter(p => p.parsed && p.parsed.action === 'submitReport');
    expect(submits2.length).toBe(1); // 差分なしでスキップ

    // 値変更で再度閉じる → POST 増える
    await page.locator('#team-list .team-card').first().click();
    await page.locator('#bs-remarks').fill('更新した備考');
    await page.locator('button:has-text("閉じる")').last().click();
    await page.waitForTimeout(300);
    const submits3 = capturedPosts.filter(p => p.parsed && p.parsed.action === 'submitReport');
    expect(submits3.length).toBe(2);
    expect(submits3[1].parsed.teams[0].remarks).toBe('更新した備考');
  });
});

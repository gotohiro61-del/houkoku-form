// S1: 即決クーポン「無料招待」送信フロー
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

test.describe('即決 無料招待', () => {
  test('無料招待を選択して送信、ペイロード検証', async ({ page }) => {
    const { capturedPosts } = await setupApiMock(page);
    await page.goto('/index.html');

    // 会場選択
    await page.locator('#venue-list .card').first().click();
    // 大会選択（ダッシュボード → 大会一覧）
    await page.locator('#tournament-list .card').first().click();
    // チーム選択 → ボトムシート
    await page.locator('#team-list .team-card').first().click();
    // 即決予約ボタン
    await page.getByRole('button', { name: '即決予約' }).click();
    await expect(page.locator('#screen-sokketsu')).toBeVisible();

    // 入力者名
    await page.locator('#sk-staff-name').fill('E2Eテスター');
    // メールは getTeamEmail でデフォルト設定済み
    // 必須: 日付・会場・レベル
    await page.locator('#sk-date1').fill('2026-04-22');
    await page.locator('#sk-venue1').fill('渋谷体育館');
    await page.locator('#sk-time1').fill('10:00');
    await page.locator('#sk-level1').fill('エンジョイ');
    await page.locator('#sk-price1').fill('17000');

    // 無料招待選択
    await page.locator('#sk-coupon1').selectOption('free');

    // 合計 ¥0 確認（レンタルなし）
    const grandTotal = await page.locator('#sk-grand-total').textContent();
    expect(grandTotal.trim()).toBe('¥0');

    // 確認画面
    await page.locator('button.btn-primary:has-text("確認画面へ")').click();
    await expect(page.locator('#sokketsu-confirm-overlay')).toHaveClass(/show/);

    // 送信
    await page.locator('#sokketsu-send-btn').click();
    await expect(page.locator('#screen-done')).toBeVisible({ timeout: 10000 });

    // POSTペイロード検証
    const sokketsuPost = capturedPosts.find(p => p.parsed && p.parsed.bookings);
    expect(sokketsuPost).toBeTruthy();
    const bk = sokketsuPost.parsed.bookings[0];
    expect(bk.couponValue).toBe('free');
    expect(bk.couponLabel).toBe('無料招待');
    expect(bk.discount).toBe(17000);
    expect(bk.subtotal).toBe(0);
    expect(sokketsuPost.parsed.grandTotal).toBe(0); // レンタルなし
  });

  test('無料招待 + レンタル1500円 → 合計1500', async ({ page }) => {
    await setupApiMock(page);
    await page.goto('/index.html');

    await page.locator('#venue-list .card').first().click();
    await page.locator('#tournament-list .card').first().click();
    await page.locator('#team-list .team-card').first().click();
    await page.getByRole('button', { name: '即決予約' }).click();

    await page.locator('#sk-staff-name').fill('T');
    await page.locator('#sk-date1').fill('2026-04-22');
    await page.locator('#sk-venue1').fill('V');
    await page.locator('#sk-time1').fill('10:00');
    await page.locator('#sk-level1').fill('L');
    await page.locator('#sk-price1').fill('17000');
    await page.locator('#sk-coupon1').selectOption('free');
    await page.locator('#sk-bib1').selectOption('1'); // ビブス 1 = 1000円
    await page.locator('#sk-ball1').selectOption('1'); // ボール 1 = 500円

    const gt = await page.locator('#sk-grand-total').textContent();
    expect(gt.trim()).toBe('¥1,500');
  });

  test('既存の1000円クーポン選択で従来通り動作', async ({ page }) => {
    await setupApiMock(page);
    await page.goto('/index.html');
    await page.locator('#venue-list .card').first().click();
    await page.locator('#tournament-list .card').first().click();
    await page.locator('#team-list .team-card').first().click();
    await page.getByRole('button', { name: '即決予約' }).click();
    await page.locator('#sk-price1').fill('17000');
    await page.locator('#sk-coupon1').selectOption('1000');
    const gt = await page.locator('#sk-grand-total').textContent();
    expect(gt.trim()).toBe('¥16,000');
  });
});

// S8 (R18): 即決予約の DB 保存結果の確認・requestId・二重送信防止（最終契約: 成功は ok===true、db は行番号）
const { test, expect } = require('@playwright/test');
const { setupApiMock } = require('./_fixtures');

const PAGES = ['index.html', 'dashboard.html'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// DB 保存失敗: サーバーの message を優先。無いときの既定文
const DB_FAIL_MSG = '少し待って、この画面のまま再送してください。続く場合は管理者へ連絡してください';
const DB_FAIL_SERVER_MSG = '予約を保存できませんでした（テスト）。少し待って同じ画面から再送してください。';

async function openSokketsuAndFill(page) {
  await page.locator('#venue-list .card').first().click();
  await page.locator('#tournament-list .card').first().click();
  await page.locator('#team-list .team-card').first().click();
  await page.getByRole('button', { name: '即決予約' }).click();
  await expect(page.locator('#screen-sokketsu')).toBeVisible();
  await page.locator('#sk-staff-name').fill('E2Eテスター');
  await page.locator('#sk-date1').fill('2026-04-22');
  await page.locator('#sk-venue1').fill('テスト体育館');
  await page.locator('#sk-time1').fill('10:00');
  await page.locator('#sk-level1').fill('エンジョイ');
  await page.locator('#sk-price1').fill('17000');
}

async function confirmAndSend(page) {
  await page.locator('button.btn-primary:has-text("確認画面へ")').click();
  await expect(page.locator('#sokketsu-confirm-overlay')).toHaveClass(/show/);
  await page.locator('#sokketsu-send-btn').click();
}

const skPosts = (captured) => captured.filter(p => p.parsed && p.parsed.bookings);

for (const pageFile of PAGES) {
  test.describe(`R18 即決予約の送信結果 (${pageFile})`, () => {
    test('DB失敗 → 完了画面を出さない → 同じ requestId で再送して成功', async ({ page }) => {
      const answers = [
        { ok: false, db: 'error', error: 'db_failed', message: DB_FAIL_SERVER_MSG, cw: null, email: null },
        { ok: true, db: 102, cw: 'OK', email: 'OK' }
      ];
      const { capturedPosts } = await setupApiMock(page, {
        sokketsuResponse: (url, parsed) => Object.assign({ reservationId: parsed.requestId }, answers.shift())
      });
      await page.goto('/' + pageFile);
      await openSokketsuAndFill(page);
      await confirmAndSend(page);

      await expect(page.locator('#sk-submit-error')).toBeVisible();
      await expect(page.locator('#sk-submit-error')).toHaveText(DB_FAIL_SERVER_MSG);
      await expect(page.locator('#screen-done')).toBeHidden();
      await expect(page.locator('#screen-sokketsu')).toBeVisible();

      await confirmAndSend(page);
      await expect(page.locator('#screen-done')).toBeVisible();
      await expect(page.locator('#done-title')).toHaveText('送信完了');

      const posts = skPosts(capturedPosts);
      expect(posts.length).toBe(2);
      expect(posts[0].parsed.requestId).toMatch(UUID_RE);
      expect(posts[0].parsed.teamKey).toBe('T1|A1|チームa'); // R列の対応スタッフ転記の照合用
      expect(posts[0].parsed.spreadsheetId).toBe('SSID_A'); // 選択中会場のブック（サーバーが resolveVenueTarget_ で検証）
      expect(posts[1].parsed.requestId).toBe(posts[0].parsed.requestId);
    });

    test('通信エラー（結果不明）→ 完了画面を出さず、再送は同じ requestId', async ({ page }) => {
      const { capturedPosts } = await setupApiMock(page);
      let abortOnce = true;
      // setupApiMock より後に登録した route が優先される。1回目の即決 POST だけ通信断にする
      await page.route('https://script.google.com/**', async (route) => {
        const req = route.request();
        let parsed = null; try { parsed = JSON.parse(req.postData() || ''); } catch (e) {}
        if (req.method() === 'POST' && parsed && parsed.bookings && abortOnce) {
          abortOnce = false;
          capturedPosts.push({ url: req.url(), body: req.postData(), parsed });
          return route.abort('failed');
        }
        return route.fallback();
      });
      await page.goto('/' + pageFile);
      await openSokketsuAndFill(page);
      await confirmAndSend(page);

      await expect(page.locator('#sk-submit-error')).toContainText('通信エラー');
      await expect(page.locator('#screen-done')).toBeHidden();
      await expect(page.locator('#sokketsu-send-btn')).toBeEnabled();

      await confirmAndSend(page);
      await expect(page.locator('#screen-done')).toBeVisible();
      const posts = skPosts(capturedPosts);
      expect(posts.length).toBe(2);
      expect(posts[1].parsed.requestId).toBe(posts[0].parsed.requestId);
    });

    test('送信中はボタン無効・二重送信しない', async ({ page }) => {
      const { capturedPosts } = await setupApiMock(page);
      await page.route('https://script.google.com/**', async (route) => {
        const req = route.request();
        let parsed = null; try { parsed = JSON.parse(req.postData() || ''); } catch (e) {}
        if (req.method() === 'POST' && parsed && parsed.bookings) {
          await new Promise(r => setTimeout(r, 600)); // 応答を遅らせる
        }
        return route.fallback();
      });
      await page.goto('/' + pageFile);
      await openSokketsuAndFill(page);
      await page.locator('button.btn-primary:has-text("確認画面へ")').click();
      await expect(page.locator('#sokketsu-confirm-overlay')).toHaveClass(/show/);
      // 画面上の連打と同等に、送信関数を続けて2回呼ぶ
      await page.evaluate(() => { doSubmitSokketsu(); doSubmitSokketsu(); });
      await expect(page.locator('#sokketsu-send-btn')).toBeDisabled();
      await expect(page.locator('#screen-done')).toBeVisible({ timeout: 10000 });
      expect(skPosts(capturedPosts).length).toBe(1);
    });
  });
}

test('duplicate:true（同じ requestId の再送）は成功扱いで完了画面', async ({ page }) => {
  await setupApiMock(page, {
    sokketsuResponse: (url, parsed) => ({ ok: true, duplicate: true, db: 55, cw: 'OK', email: 'OK', reservationId: parsed.requestId })
  });
  await page.goto('/index.html');
  await openSokketsuAndFill(page);
  await confirmAndSend(page);
  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-title')).toHaveText('送信完了');
});

test('DB保存成功・通知が両方失敗 → 「予約登録OK」（受付失敗と混同しない）', async ({ page }) => {
  await setupApiMock(page, {
    sokketsuResponse: (url, parsed) => ({ ok: true, db: 103, cw: 'エラー: テスト', email: 'エラー: テスト', reservationId: parsed.requestId })
  });
  await page.goto('/index.html');
  await openSokketsuAndFill(page);
  await confirmAndSend(page);
  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-title')).toHaveText('予約登録OK');
  await expect(page.locator('#done-error')).toContainText('予約は保存済みです');
});

test('保存失敗の後に入力し直したら requestId を作り直す（同じ内容の再送だけ同じ値）', async ({ page }) => {
  const answers = [
    { ok: false, db: 'error', error: 'db_failed', cw: null, email: null },
    { ok: false, db: 'error', error: 'db_failed', cw: null, email: null },
    { ok: true, db: 104, cw: 'OK', email: 'OK' }
  ];
  const { capturedPosts } = await setupApiMock(page, {
    sokketsuResponse: (url, parsed) => Object.assign({ reservationId: parsed.requestId }, answers.shift())
  });
  await page.goto('/index.html');
  await openSokketsuAndFill(page);
  await confirmAndSend(page);                       // 1回目: 保存失敗
  await expect(page.locator('#sk-submit-error')).toHaveText(DB_FAIL_MSG);
  await confirmAndSend(page);                       // 2回目: 同じ内容 → 同じ requestId
  await expect(page.locator('#sk-submit-error')).toHaveText(DB_FAIL_MSG);
  await page.locator('#sk-venue1').fill('別の体育館'); // 入力し直し
  await confirmAndSend(page);                       // 3回目: 新しい requestId
  await expect(page.locator('#screen-done')).toBeVisible();
  const ids = skPosts(capturedPosts).map(p => p.parsed.requestId);
  expect(ids.length).toBe(3);
  expect(ids[1]).toBe(ids[0]);
  expect(ids[2]).not.toBe(ids[0]);
  expect(ids[2]).toMatch(UUID_RE);
});

test('メール再送は予約IDで送る（旧データは再送不可）', async ({ page }) => {
  const rid = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const items = [
    { date: '2026/04/21', time: '10:00', team: 'チームA', rep: '山田 太郎', email: 'a@example.com', slotCount: 1, venue: 'V',
      cwOk: true, emailOk: false, tournamentId: 'T1', reservationId: rid },
    { date: '2026/04/21', time: '09:00', team: 'チームB', rep: '鈴木 花子', email: 'b@example.com', slotCount: 1, venue: 'V',
      cwOk: true, emailOk: false, tournamentId: 'T1', reservationId: '' }
  ];
  const { capturedPosts } = await setupApiMock(page, {
    customResponses: [
      { match: (url) => url.includes('action=getHistory'), response: () => ({ items }) },
      { match: (url, parsed) => parsed && parsed.action === 'resendEmail', response: (url, parsed) => ({ email: 'OK', reservationId: parsed.reservationId }) }
    ]
  });
  await page.goto('/index.html');
  await page.locator('#venue-list .card').first().click();
  await page.evaluate(() => goHistoryScreen());
  await expect(page.locator('#history-list .history-card')).toHaveCount(2);
  await page.locator('#resend-0').click();
  await expect(page.locator('#resend-0')).toHaveText('完了');
  await page.locator('#resend-1').click();
  await expect(page.locator('#resend-1')).toHaveText('再送不可');
  const resends = capturedPosts.filter(p => p.parsed && p.parsed.action === 'resendEmail');
  expect(resends.length).toBe(1);
  expect(resends[0].parsed.reservationId).toBe(rid);
  expect(resends[0].parsed.bookings).toBeUndefined();
  expect(resends[0].parsed.rep).toBeUndefined();
});

// busy（サーバーがロックを取れず、保存も通知もしていない）→ 同じ requestId で 5 秒間隔・最大 3 回の自動再送
const BUSY_RES = { ok: false, db: 'busy', error: 'busy', message: '混み合っています。少し待ってから再送してください（テスト）' };

test('busy×2 → 5秒間隔・同じ requestId で自動再送して成功', async ({ page }) => {
  test.setTimeout(45000);
  const times = [];
  const answers = [BUSY_RES, BUSY_RES, { ok: true, db: 105, cw: 'OK', email: 'OK' }];
  const { capturedPosts } = await setupApiMock(page, {
    sokketsuResponse: (url, parsed) => { times.push(Date.now()); return Object.assign({ reservationId: parsed.requestId }, answers.shift()); }
  });
  await page.goto('/index.html');
  await openSokketsuAndFill(page);
  await confirmAndSend(page);

  await expect(page.locator('#loading-text')).toHaveText('混み合っています。数秒後に自動で再送します');
  await expect(page.locator('#loading-overlay')).not.toHaveClass(/hidden/);
  await expect(page.locator('#sokketsu-send-btn')).toBeDisabled();
  await expect(page.locator('#screen-done')).toBeVisible({ timeout: 20000 });

  const posts = skPosts(capturedPosts);
  expect(posts.length).toBe(3);
  expect(new Set(posts.map(p => p.parsed.requestId)).size).toBe(1);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(4500);
  expect(times[2] - times[1]).toBeGreaterThanOrEqual(4500);
});

for (const pageFile of PAGES) {
  test(`busy が続く（自動再送3回とも busy）→ message を表示し、同じ requestId で手動再送 (${pageFile})`, async ({ page }) => {
    const answers = [BUSY_RES, BUSY_RES, BUSY_RES, BUSY_RES, { ok: true, db: 106, cw: 'OK', email: 'OK' }];
    const { capturedPosts } = await setupApiMock(page, {
      sokketsuResponse: (url, parsed) => Object.assign({ reservationId: parsed.requestId }, answers.shift())
    });
    await page.goto('/' + pageFile);
    await page.evaluate(() => { window.SK_BUSY_RETRY_MS = 200; }); // 待ち時間だけ短縮（回数・動作は本番どおり）
    await openSokketsuAndFill(page);
    await confirmAndSend(page);

    await expect(page.locator('#sk-submit-error')).toHaveText(BUSY_RES.message, { timeout: 10000 });
    await expect(page.locator('#screen-done')).toBeHidden();
    await expect(page.locator('#loading-overlay')).toHaveClass(/hidden/);
    expect(skPosts(capturedPosts).length).toBe(4); // 初回＋自動再送3回

    await confirmAndSend(page);                      // 手動再送
    await expect(page.locator('#screen-done')).toBeVisible();
    const posts = skPosts(capturedPosts);
    expect(posts.length).toBe(5);
    expect(new Set(posts.map(p => p.parsed.requestId)).size).toBe(1);
  });
}

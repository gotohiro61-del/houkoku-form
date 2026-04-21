// 本番サイト向け E2E 設定（実 GAS は page.route でモック、実サーバー影響なし）
module.exports = {
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    baseURL: 'https://gotohiro61-del.github.io/houkoku-form/',
  },
  projects: [
    {
      name: 'chromium-prod',
      use: { browserName: 'chromium' },
    },
  ],
  // webServer なし = 本番サイトを直接叩く
};

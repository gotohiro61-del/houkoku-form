// Playwright config for BOOKS houkoku-form E2E tests
const { devices } = require('@playwright/test');

module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false, // 共通ポート使用のため直列実行
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    // iPhone 13 相当のビューポート
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // ローカルサーバー経由で index.html を配信
    baseURL: 'http://localhost:8765/',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: undefined, // bundled Chromium
      },
    },
  ],
  webServer: {
    // シンプルな static サーバー（http-server 代替を node -e で起動）
    command: 'node _static_server.js',
    port: 8765,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 10000,
  },
};

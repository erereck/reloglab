import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 360_000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: (process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === 'win32' ? 'msedge' : 'chromium')) as 'msedge' | 'chromium',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'off',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});

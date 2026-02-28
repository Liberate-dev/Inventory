import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'php -d auto_prepend_file=D:/laragon/www/pklbaru/Inventory/e2e/php-prepend.php -S 127.0.0.1:8000 -t .',
      url: 'http://127.0.0.1:8000/public/api/test.php',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:8000/public/api',
      },
    },
  ],
});

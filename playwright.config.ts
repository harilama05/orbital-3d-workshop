import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const localChrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15000,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || localChrome,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    permissions: ['camera'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30000 },
});

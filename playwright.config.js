// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: undefined,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'node ./node_modules/spa-ssi/serve.js',
        url: 'http://localhost:8000',
        reuseExistingServer: !process.env.CI,
    },
});

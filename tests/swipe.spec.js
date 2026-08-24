// @ts-check
import { test, expect } from '@playwright/test';

test('swipe dismiss feature passes manual assertions', async ({ page }) => {
    const messages = [];
    page.on('console', msg => messages.push(msg.text()));
    page.on('pageerror', err => messages.push(`ERROR: ${err.message}`));

    await page.goto('/tests/test1.html');
    await page.waitForFunction(() => {
        return document.readyState === 'complete';
    });

    // Give the test scripts time to run.
    await page.waitForTimeout(500);

    expect(messages).toContain('All SwipeDismissFeature tests passed!');
});

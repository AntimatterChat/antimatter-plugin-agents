// spec: specs/agents-tour.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

import { RunSystemConsoleContainer, adminUsername, adminPassword } from 'helpers/system-console-container';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';

let antimatter: AntimatterContainer;

test.beforeAll(async () => {
    antimatter = await RunSystemConsoleContainer({
        services: [{
            id: 'mock-service',
            name: 'Mock Service',
            type: 'openaicompatible',
            apiKey: 'mock',
            apiURL: 'http://localhost:8080',
        }],
        bots: [],
    });
});

test.afterAll(async () => {
    await antimatter.stop();
});

test.describe('Agents Tour - No Bots Configured', () => {
    test('Tour does not appear when no bots are configured', async ({ page }) => {
        const amPage = new AntimatterPage(page);

        await amPage.login(antimatter.url(), adminUsername, adminPassword);
        await page.getByTestId('channel_view').waitFor({ state: 'visible', timeout: 30000 });

        const pulsatingDot = page.getByTestId('agents-tour-dot');
        await expect(pulsatingDot).not.toBeVisible({ timeout: 5000 });

        const tourPopover = page.locator('.tour-tip-tippy');
        await expect(tourPopover).not.toBeVisible();
    });
});

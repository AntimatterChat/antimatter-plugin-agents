// spec: Bot Management UI — legacy editor removed; notice + default bot from runtime
// seed: e2e/tests/seed.spec.ts

import { test, expect } from '@playwright/test';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { SystemConsoleHelper } from 'helpers/system-console';
import { OpenAIMockContainer, RunOpenAIMocks } from 'helpers/openai-mock';
import RunSystemConsoleContainer, { adminUsername, adminPassword } from 'helpers/system-console-container';

/**
 * Test Suite: Bot Management UI
 *
 * Legacy card-based bot editing was removed from System Console; agents are managed in Integrations › Agents.
 */

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

test.describe('Bot Management UI', () => {
    test.beforeAll(async () => {
        antimatter = await RunSystemConsoleContainer({
            services: [
                {
                    id: 'test-service-id',
                    name: 'Test Service',
                    type: 'openaicompatible',
                    apiURL: 'http://openai-mock:11434',
                    apiKey: 'test-key',
                    orgId: '',
                    defaultModel: 'gpt-4',
                    tokenLimit: 16384,
                    streamingTimeoutSeconds: 30,
                    outputTokenLimit: 4096,
                    useResponsesAPI: false,
                },
            ],
            bots: [],
        });

        openAIMock = await RunOpenAIMocks(antimatter.network);
    });

    test.afterAll(async () => {
        await openAIMock.stop();
        await antimatter.stop();
    });

    test('should show moved notice instead of legacy bot editor', async ({ page }) => {
        test.setTimeout(60000);

        const amPage = new AntimatterPage(page);
        const systemConsole = new SystemConsoleHelper(page);

        await amPage.login(antimatter.url(), adminUsername, adminPassword);
        await systemConsole.navigateToPluginConfig(antimatter.url());
        await systemConsole.waitForBotsPanel();

        await expect(page.getByText(/AI bot configuration has moved/i)).toBeVisible();
        await expect(page.getByRole('link', { name: /open agents/i })).toBeVisible();

        await expect(systemConsole.getAddBotButton()).not.toBeVisible();
        await expect(page.locator('[class*="BotContainer"]')).toHaveCount(0);
    });
});

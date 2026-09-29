import { test, expect, Page } from '@playwright/test';

import RunContainer from 'helpers/plugincontainer';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { AIPlugin } from 'helpers/ai-plugin';
import { OpenAIMockContainer, RunOpenAIMocks } from 'helpers/openai-mock';

const username = 'regularuser';
const password = 'regularuser';

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

test.beforeAll(async () => {
    antimatter = await RunContainer();
    openAIMock = await RunOpenAIMocks(antimatter.network);
});

test.beforeEach(async () => {
    // Reset mocks before each test to prevent cross-contamination
    await openAIMock.resetMocks();
});

test.afterAll(async () => {
    await openAIMock.stop();
    await antimatter.stop();
});

async function setupTestPage(page: Page) {
    const amPage = new AntimatterPage(page);
    const aiPlugin = new AIPlugin(page);
    const url = antimatter.url();

    await amPage.login(url, username, password);

    return { amPage, aiPlugin };
}

test.describe('Search Entry Points', () => {
    test('Agents search option visible when search is enabled', async ({ page }) => {
        const { amPage, aiPlugin } = await setupTestPage(page);

        // Wait for plugin to be fully initialized
        await aiPlugin.openRHS();
        await expect(aiPlugin.rhsPostTextarea).toBeEnabled({ timeout: 30000 });
        await aiPlugin.closeRHS();

        // Verify "Agents" search option is visible
        await aiPlugin.expectAgentsSearchVisible();
    });
});

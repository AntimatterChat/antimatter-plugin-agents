import { test, expect } from '@playwright/test';
import RunContainer from 'helpers/plugincontainer';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { AIPlugin } from 'helpers/ai-plugin';
import { OpenAIMockContainer, RunOpenAIMocks, responseTest, responseTestText } from 'helpers/openai-mock';

const username = 'regularuser';
const password = 'regularuser';

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

test.beforeAll(async () => {
    antimatter = await RunContainer();
    openAIMock = await RunOpenAIMocks(antimatter.network);
});

test.afterAll(async () => {
    await openAIMock.stop();
    await antimatter.stop();
});

async function setupTestPage(page) {
    const amPage = new AntimatterPage(page);
    const aiPlugin = new AIPlugin(page);
    const url = antimatter.url();

    await amPage.login(url, username, password);

    return { amPage, aiPlugin };
}

test.describe('Debug', () => {
    test('Basic response works (from working test)', async ({ page }) => {
        const { aiPlugin } = await setupTestPage(page);
        await aiPlugin.openRHS();

        // Use the exact mock from basic.spec.ts that we know works
        await openAIMock.addCompletionMock(responseTest);
        await aiPlugin.sendMessage('Hello!');
        await aiPlugin.waitForBotResponse(responseTestText);

        // If we get here, basic mocking works
        await expect(page.getByText(responseTestText)).toBeVisible();
    });
});

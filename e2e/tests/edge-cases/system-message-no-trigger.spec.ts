// spec: MM-67969 - system messages with @agent mentions must not trigger replies.
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

import RunContainer from 'helpers/plugincontainer';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { OpenAIMockContainer, RunOpenAIMocks, responseTest } from 'helpers/openai-mock';

const username = 'regularuser';
const password = 'regularuser';

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

test.beforeAll(async () => {
    antimatter = await RunContainer();
    openAIMock = await RunOpenAIMocks(antimatter.network);
});

test.beforeEach(async () => {
    await openAIMock.resetMocks();
});

test.afterAll(async () => {
    await openAIMock?.stop();
    await antimatter?.stop();
});

test.describe('System messages do not trigger agent', () => {
    test('updating a channel header to mention an agent does not trigger a response', async ({ page }) => {
        // Seed a mock so a regressed agent call becomes visible as a bot post.
        await openAIMock.addCompletionMock(responseTest);

        const client = await antimatter.getClient(username, password);
        const teams = await client.getMyTeams();
        const channels = await client.getMyChannels(teams[0].id);
        const townSquare = channels.find((c) => c.name === 'town-square');
        if (!townSquare) {
            throw new Error('town-square channel not found');
        }

        const beforePosts = await client.getPosts(townSquare.id, 0, 200);
        const beforeIds = new Set(Object.keys(beforePosts.posts || {}));

        const amPage = new AntimatterPage(page);
        await amPage.login(antimatter.url(), username, password);
        await page.goto(`${antimatter.url()}/test/channels/town-square`);
        await page.getByTestId('channel_view').waitFor({ state: 'visible', timeout: 30000 });

        await client.patchChannel(townSquare.id, { header: '@mock please respond' });

        // Find the header-change system post, scoped away from the rendered channel header.
        const systemMessage = page
            .getByTestId('postContent')
            .filter({ hasText: /updated the channel header/i })
            .first();
        await expect(systemMessage).toBeVisible({ timeout: 15000 });

        // Give the plugin a window to (incorrectly) generate and stream a reply.
        await page.waitForTimeout(5000);

        const afterPosts = await client.getPosts(townSquare.id, 0, 200);
        const newPosts = Object.values(afterPosts.posts || {})
            .filter((p) => !beforeIds.has(p.id));

        // Scope to bot post type to avoid false positives from unrelated posts.
        const botResponses = newPosts.filter((p) => p.type === 'custom_llmbot');
        expect(
            botResponses,
            `Expected no bot response to the header change system message. Got: ${JSON.stringify(botResponses, null, 2)}`,
        ).toEqual([]);
    });
});

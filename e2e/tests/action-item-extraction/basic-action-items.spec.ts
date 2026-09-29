import { test, expect } from '@playwright/test';

import RunContainer from 'helpers/plugincontainer';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { AIPlugin } from 'helpers/ai-plugin';
import { OpenAIMockContainer, RunOpenAIMocks } from 'helpers/openai-mock';

// spec: /Users/nickmisasi/workspace/worktrees/antimatter-plugin-ai-agents-in-e2e/e2e/specs/action-item-extraction.md
// seed: /Users/nickmisasi/workspace/worktrees/antimatter-plugin-ai-agents-in-e2e/seed.spec.ts

// Test configuration
const username = 'regularuser';
const password = 'regularuser';

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

// Mock response for action items
const actionItemsResponse = `
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"Based"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" on"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" the"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" conversation"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":","},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" here"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" are"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" the"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" action"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" items"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":":"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" 1"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"."},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" John"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" to"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" update"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" project"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" roadmap"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" by"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{"content":" Friday"},"logprobs":null,"finish_reason":null}]}
data: {"id":"chatcmpl-ai-1","object":"chat.completion.chunk","created":1708124577,"model":"gpt-3.5-turbo-0613","system_fingerprint":null,"choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}
data: [DONE]
`.trim().split('\n').filter(l => l).join('\n\n') + '\n\n';

const actionItemsResponseText = "Based on the conversation, here are the action items: 1. John to update project roadmap by Friday";

// Setup for all tests in the file
test.beforeAll(async () => {
    antimatter = await RunContainer();
    openAIMock = await RunOpenAIMocks(antimatter.network);
});

test.beforeEach(async () => {
    // Reset mocks before each test to prevent cross-contamination
    await openAIMock.resetMocks();
});

// Cleanup after all tests
test.afterAll(async () => {
    await openAIMock.stop();
    await antimatter.stop();
});

// Common test setup
async function setupTestPage(page) {
    const amPage = new AntimatterPage(page);
    const aiPlugin = new AIPlugin(page);
    const url = antimatter.url();

    await amPage.login(url, username, password);

    return { amPage, aiPlugin };
}

test.describe('Basic Action Item Extraction', () => {
    test('Extract Action Items from Thread', async ({ page }) => {
        const { amPage, aiPlugin } = await setupTestPage(page);

        // Create a thread with some replies
        const rootPost = await amPage.sendMessageAsUser(
            antimatter,
            username,
            password,
            'We need to discuss the project timeline'
        );

        const userClient = await antimatter.getClient(username, password);

        // Add some thread replies
        await userClient.createPost({
            channel_id: rootPost.channel_id,
            root_id: rootPost.id,
            message: 'John, can you update the project roadmap by Friday?'
        });

        await userClient.createPost({
            channel_id: rootPost.channel_id,
            root_id: rootPost.id,
            message: 'Sarah needs to schedule the stakeholder meeting next week'
        });

        // Navigate to the post
        await page.goto(antimatter.url() + '/test/channels/town-square');
        await page.locator(`#post_${rootPost.id}`).waitFor({ state: 'visible' });

        // Open AI Actions menu and click "Find action items"
        await page.locator(`#post_${rootPost.id}`).hover();
        await page.getByTestId(`ai-actions-menu`).click();

        await openAIMock.addCompletionMock(actionItemsResponse);
        await page.getByRole('button', { name: 'Find action items' }).click();

        // Verify the AI RHS opens with the action items response
        await aiPlugin.expectRHSOpenWithPost();
        await expect(page.getByText('action items')).toBeVisible();
    });
});

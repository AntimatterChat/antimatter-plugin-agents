import { test, expect } from '@playwright/test';

import RunContainer from 'helpers/plugincontainer';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { AIPlugin } from 'helpers/ai-plugin';
import { OpenAIMockContainer, RunOpenAIMocks, responseTest, responseTestText } from 'helpers/openai-mock';

// Test configuration
const username = 'regularuser';
const password = 'regularuser';

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

// Setup for all tests in the file
test.beforeAll(async () => {
  antimatter = await RunContainer();
  openAIMock = await RunOpenAIMocks(antimatter.network);
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

test.describe('New Messages Line RHS Functionality', () => {
  test('new messages line opens RHS when summarize is clicked', async ({ page }) => {
    const { amPage, aiPlugin } = await setupTestPage(page);

    // First, user1 (regularuser) sends a message to establish baseline
    await amPage.sendChannelMessage('Initial message for testing');

    // Second user posts a message
    const secondUserMessage = 'This is a new message from second user';
    const secondPost = await amPage.sendMessageAsUser(antimatter, 'seconduser', 'seconduser', secondUserMessage);

    // Mark the second user's message as unread to trigger new messages line
    await amPage.markMessageAsUnread(secondPost.id);

    // Set up the mock for the OpenAI completion request
    await openAIMock.addCompletionMock(responseTest);

    // Click the Ask AI button to open the dropdown
    await aiPlugin.clickNewMessagesButton();

    // Click on "Summarize new messages" option
    await aiPlugin.clickSummarizeNewMessages();

    // Verify that the RHS opens and displays the AI response
    await aiPlugin.expectRHSOpenWithPost();

    // Wait for and verify the bot response appears in the RHS
    await aiPlugin.waitForBotResponse(responseTestText);
  });
});

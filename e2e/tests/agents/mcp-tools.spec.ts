import { test, expect } from '@playwright/test';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import {
    OpenAIMockContainer,
    RunOpenAIMocks,
    buildTextResponse,
    buildChatCompletionMockRule,
    buildToolCallResponse,
} from 'helpers/openai-mock';
import {
    RunAgentContainer,
    agentAdminUsername, agentAdminPassword,
    agentRegularUsername, agentRegularPassword,
    mockServiceId,
} from 'helpers/agent-container';
import { AgentAPIHelper } from 'helpers/agent-api';
import { AgentPageHelper } from 'helpers/agent-page';
import { AIPlugin } from 'helpers/ai-plugin';

/** Matches mcp.EmbeddedClientKey — MCP server origin for the embedded Antimatter tools server. */
const embeddedAntimatterOrigin = 'embedded://mattermost';

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

test.describe('Agent MCP Tools', () => {
    test.beforeAll(async () => {
        test.setTimeout(180000);
        antimatter = await RunAgentContainer();
        openAIMock = await RunOpenAIMocks(antimatter.network);
    });

    test.afterAll(async () => {
        await openAIMock?.stop();
        await antimatter?.stop();
    });

    test('agent with no enabledMCPTools gets no MCP tools', async ({ page }) => {
        test.setTimeout(90000);
        const agentApi = new AgentAPIHelper(antimatter.url());
        const adminClient = await antimatter.getClient(agentAdminUsername, agentAdminPassword);
        const token = adminClient.getToken();

        const noToolsAgent = await agentApi.createTestAgent(token, {
            displayName: 'No Tools Agent',
            username: 'notoolsagent',
            serviceID: mockServiceId,
            autoEnableNewMCPTools: false,
            enabledMCPTools: [],
            enabledNativeTools: [],
        });

        // Prove enabledMCPTools=[] reaches the LLM without read_post in the completion payload: first rule
        // would match if "read_post" were sent; second rule is the catch-all success response.
        await openAIMock.addMocks([
            buildChatCompletionMockRule(
                buildTextResponse('WRONG: read_post in completion request when enabledMCPTools is empty'),
                { bodyContains: 'read_post' },
            ),
            buildChatCompletionMockRule(buildTextResponse('I have no tools available.')),
        ]);

        const amPage = new AntimatterPage(page);
        const aiPlugin = new AIPlugin(page);
        await amPage.login(antimatter.url(), agentRegularUsername, agentRegularPassword);
        await page.goto(`${antimatter.url()}/test/channels/town-square`);
        await page.getByTestId('channel_view').waitFor({ state: 'visible', timeout: 60000 });

        await aiPlugin.openRHS();
        await aiPlugin.switchBotWhenListed(noToolsAgent.displayName);
        await aiPlugin.sendMessage('Hello');
        await aiPlugin.waitForBotResponse('I have no tools available.');
    });

    test('MCPs tab shows embedded server and tool affordances in config view', async ({ page }) => {
        test.setTimeout(60000);
        const amPage = new AntimatterPage(page);
        const agentPage = new AgentPageHelper(page);

        await amPage.login(antimatter.url(), agentAdminUsername, agentAdminPassword);
        await agentPage.navigateToAgents(antimatter.url());

        await agentPage.getCreateButton().click();
        await agentPage.waitForModal();

        await agentPage.getModalTab('MCPs').click();

        await expect(agentPage.getMCPSearchInput()).toBeVisible({ timeout: 15000 });
        // Provider name from GET /mcp/tools (mcp.EmbeddedServerName)
        await expect(page.getByText('Antimatter', {exact: true})).toBeVisible({ timeout: 15000 });
    });

    // MM-69185 regression: visiting the MCPs tab on an agent whose persisted
    // enabledMCPTools list contains entries that are no longer present in the
    // live MCP catalog (orphans) used to silently mark the form dirty. Clicking
    // Cancel then incorrectly raised the "Discard changes?" confirmation modal.
    test('Cancel on MCPs tab with orphaned saved tools does not prompt to discard (MM-69185)', async ({ page }) => {
        test.setTimeout(60000);
        const agentApi = new AgentAPIHelper(antimatter.url());
        const adminClient = await antimatter.getClient(agentAdminUsername, agentAdminPassword);
        const token = adminClient.getToken();

        const orphanAgent = await agentApi.createTestAgent(token, {
            displayName: 'Orphan Tool Agent',
            username: 'orphantoolagent',
            serviceID: mockServiceId,
            autoEnableNewMCPTools: false,
            // The "ghost_tool" name does not exist on the embedded MCP server, so
            // the live MCP catalog will report it as an orphan when the editor
            // mounts the MCPs tab.
            enabledMCPTools: [
                { server_origin: embeddedAntimatterOrigin, tool_name: 'ghost_tool' },
            ],
            enabledNativeTools: [],
        });

        const amPage = new AntimatterPage(page);
        const agentPage = new AgentPageHelper(page);

        await amPage.login(antimatter.url(), agentAdminUsername, agentAdminPassword);
        await agentPage.navigateToAgents(antimatter.url());
        await agentPage.openAgentActions(orphanAgent.displayName);
        await agentPage.clickEditAction(orphanAgent.displayName);
        await agentPage.waitForModal();

        await agentPage.getModalTab('MCPs').click();

        // Wait for the live MCP catalog to render — at this point orphan
        // reconciliation has run.
        await expect(page.getByText('Antimatter', { exact: true })).toBeVisible({ timeout: 15000 });

        await agentPage.getModalCancelButton().click();

        // The Cancel must exit immediately without the Discard confirmation modal,
        // because the user did not make any edits.
        await expect(agentPage.getDiscardChangesDialog()).not.toBeVisible();
        await agentPage.waitForModalClosed();
    });

    test('agent with specific enabledMCPTools responds correctly', async ({ page }) => {
        test.setTimeout(90000);
        const agentApi = new AgentAPIHelper(antimatter.url());
        const adminClient = await antimatter.getClient(agentAdminUsername, agentAdminPassword);
        const token = adminClient.getToken();
        const teams = await adminClient.getMyTeams();
        const defaultTeam = teams[0];
        const channels = await adminClient.getMyChannels(defaultTeam.id);
        const townSquare = channels.find((channel) => channel.name === 'town-square');

        if (!townSquare) {
            throw new Error('town-square channel not found');
        }

        const selectiveAgent = await agentApi.createTestAgent(token, {
            displayName: 'Selective Tools Agent',
            username: 'selectivetoolsagent',
            serviceID: mockServiceId,
            autoEnableNewMCPTools: false,
            enabledMCPTools: [
                { server_origin: embeddedAntimatterOrigin, tool_name: 'read_post' },
            ],
            enabledNativeTools: [],
        });

        const seededPost = await adminClient.createPost({
            channel_id: townSquare.id,
            message: `Selective tool seeded post ${Date.now()}`,
        });
        const toolCallId = 'call_specific_enabledMCPTools_read_post';
        const selectiveAgentSystemPrompt =
            'You are called Selective Tools Agent with the username selectivetoolsagent';
        const toolPrompt =
            `Use the read_post tool to read the Antimatter post with ID ${seededPost.id}. ` +
            'Summarize its contents. Do not answer from memory. Call the tool now.';

        // Prove the allowed tool reaches runtime by requiring a read_post tool call first, then only
        // returning the success text once the follow-up completion includes that tool call ID.
        await openAIMock.addMocks([
            buildChatCompletionMockRule(buildTextResponse('Selective tool title'), {
                bodyContains:
                    'Write a short title for the following request. Include only the title and nothing else, no quotations. Request:',
                times: 1,
            }),
            buildChatCompletionMockRule(
                buildToolCallResponse(
                    toolCallId,
                    'read_post',
                    JSON.stringify({post_id: seededPost.id}),
                ),
                {
                    bodyContains: selectiveAgentSystemPrompt,
                    times: 1,
                },
            ),
            buildChatCompletionMockRule(buildTextResponse('I used the selected tool at runtime.'), {
                bodyContains: toolCallId,
                times: 1,
            }),
        ]);

        const amPage = new AntimatterPage(page);
        const aiPlugin = new AIPlugin(page);
        await amPage.login(antimatter.url(), agentRegularUsername, agentRegularPassword);
        await page.goto(`${antimatter.url()}/test/channels/town-square`);
        await page.getByTestId('channel_view').waitFor({ state: 'visible', timeout: 60000 });

        await aiPlugin.openRHS();
        await aiPlugin.switchBotWhenListed(selectiveAgent.displayName);
        await aiPlugin.sendMessage(toolPrompt);
        await aiPlugin.waitForBotResponse('I used the selected tool at runtime.');
    });

    // RHS Tool Providers popover filters by server (provider): when the active bot has
    // autoEnableNewMCPTools=false it shows only servers whose origins appear in enabledMCPTools.
    // Individual tools are not listed here — the MCPs tab / server policy covers tool-level affordances.
    test('RHS Tools popover shows no providers when agent has empty enabledMCPTools', async ({ page }) => {
        test.setTimeout(90000);
        const agentApi = new AgentAPIHelper(antimatter.url());
        const adminClient = await antimatter.getClient(agentAdminUsername, agentAdminPassword);
        const token = adminClient.getToken();

        const agent = await agentApi.createTestAgent(token, {
            displayName: 'RHS Empty MCP Agent',
            serviceID: mockServiceId,
            autoEnableNewMCPTools: false,
            enabledMCPTools: [],
            enabledNativeTools: [],
        });

        const amPage = new AntimatterPage(page);
        const aiPlugin = new AIPlugin(page);

        await amPage.login(antimatter.url(), agentRegularUsername, agentRegularPassword);
        await amPage.createAndNavigateToDMWithBot(
            antimatter, agentRegularUsername, agentRegularPassword, agent.name,
        );

        await aiPlugin.openRHS();
        await expect(page.getByTestId('bot-selector-rhs')).toBeVisible({ timeout: 15000 });
        await aiPlugin.switchBotWhenListed(agent.displayName);

        const menu = await aiPlugin.openRhsToolProvidersMenu();
        await expect(menu.getByText('Tool Providers', { exact: true })).toBeVisible();
        await expect(menu.getByText('No tool providers available')).toBeVisible({ timeout: 20000 });
    });

    test('RHS Tools popover shows Antimatter provider when only embedded tools are enabled', async ({ page }) => {
        test.setTimeout(90000);
        const agentApi = new AgentAPIHelper(antimatter.url());
        const adminClient = await antimatter.getClient(agentAdminUsername, agentAdminPassword);
        const token = adminClient.getToken();

        const agent = await agentApi.createTestAgent(token, {
            displayName: 'RHS Embedded Only Agent',
            serviceID: mockServiceId,
            autoEnableNewMCPTools: false,
            enabledMCPTools: [
                { server_origin: embeddedAntimatterOrigin, tool_name: 'read_post' },
            ],
            enabledNativeTools: [],
        });

        const amPage = new AntimatterPage(page);
        const aiPlugin = new AIPlugin(page);

        await amPage.login(antimatter.url(), agentRegularUsername, agentRegularPassword);
        await amPage.createAndNavigateToDMWithBot(
            antimatter, agentRegularUsername, agentRegularPassword, agent.name,
        );

        await aiPlugin.openRHS();
        await expect(page.getByTestId('bot-selector-rhs')).toBeVisible({ timeout: 15000 });
        await aiPlugin.switchBotWhenListed(agent.displayName);

        const menu = await aiPlugin.openRhsToolProvidersMenu();
        await expect(menu.getByText('Tool Providers', { exact: true })).toBeVisible();
        await expect(menu.getByText('Antimatter')).toBeVisible({ timeout: 20000 });
        await expect(menu.getByText('No tool providers available')).not.toBeVisible();
    });

    test('editing an auto-enable-all agent preserves MCP provider access', async ({ page }) => {
        test.setTimeout(90000);
        const agentApi = new AgentAPIHelper(antimatter.url());
        const adminClient = await antimatter.getClient(agentAdminUsername, agentAdminPassword);
        const token = adminClient.getToken();

        const agent = await agentApi.createTestAgent(token, {
            displayName: 'Implicit All Agent',
            serviceID: mockServiceId,
            enabledNativeTools: [],
            // createTestAgent defaults autoEnableNewMCPTools=true.
        });

        let fetched = await agentApi.getAgent(token, agent.id);
        expect(fetched.autoEnableNewMCPTools).toBe(true);

        const amPage = new AntimatterPage(page);
        const agentPage = new AgentPageHelper(page);
        const aiPlugin = new AIPlugin(page);

        await amPage.login(antimatter.url(), agentAdminUsername, agentAdminPassword);
        await agentPage.navigateToAgents(antimatter.url());
        await agentPage.openAgentActions('Implicit All Agent');
        await agentPage.clickEditAction('Implicit All Agent');
        await agentPage.waitForModal();

        await agentPage.getDisplayNameInput().clear();
        await agentPage.getDisplayNameInput().fill('Implicit All Agent Updated');
        await agentPage.getModalSaveButton().click();
        await agentPage.waitForModalClosed();

        fetched = await agentApi.getAgent(token, agent.id);
        expect(fetched.autoEnableNewMCPTools).toBe(true);

        await page.context().clearCookies();
        await amPage.login(antimatter.url(), agentRegularUsername, agentRegularPassword);
        await amPage.createAndNavigateToDMWithBot(
            antimatter, agentRegularUsername, agentRegularPassword, agent.name,
        );

        await aiPlugin.openRHS();
        await expect(page.getByTestId('bot-selector-rhs')).toBeVisible({ timeout: 15000 });
        await aiPlugin.switchBotWhenListed('Implicit All Agent Updated');

        const menu = await aiPlugin.openRhsToolProvidersMenu();
        await expect(menu.getByText('Tool Providers', { exact: true })).toBeVisible();
        await expect(menu.getByText('Antimatter')).toBeVisible({ timeout: 20000 });
        await expect(menu.getByText('No tool providers available')).not.toBeVisible();
    });

    test('RHS Tools popover lists Antimatter for default Mock Bot (no per-agent MCP restriction)', async ({
        page,
    }) => {
        test.setTimeout(90000);
        const amPage = new AntimatterPage(page);
        const aiPlugin = new AIPlugin(page);

        await amPage.login(antimatter.url(), agentRegularUsername, agentRegularPassword);
        await page.goto(`${antimatter.url()}/test/channels/town-square`);
        await page.getByTestId('channel_view').waitFor({ state: 'visible', timeout: 60000 });

        await aiPlugin.openRHS();
        await expect(page.getByTestId('bot-selector-rhs')).toBeVisible({ timeout: 15000 });
        await aiPlugin.switchBotWhenListed('Mock Bot');

        const menu = await aiPlugin.openRhsToolProvidersMenu();
        await expect(menu.getByText('Antimatter')).toBeVisible({ timeout: 20000 });
    });
});

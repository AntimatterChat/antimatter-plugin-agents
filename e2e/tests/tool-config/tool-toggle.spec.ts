import { test, expect } from '@playwright/test';
import AntimatterContainer from 'helpers/amcontainer';
import { AntimatterPage } from 'helpers/am';
import { OpenAIMockContainer, RunOpenAIMocks } from 'helpers/openai-mock';
import { RunToolConfigContainer } from 'helpers/tool-config-container';
import { ToolConfigUIHelper, createToolConfigAPIHelper, ToolConfigAPIHelper } from 'helpers/tool-config';
import { adminUsername, adminPassword } from 'helpers/system-console-container';

/**
 * Test Suite: Per-Tool Enable/Disable (4.5)
 *
 * Verifies that admin can enable/disable individual tools via toggle,
 * that changes persist, and that disabled tools are excluded from the
 * user-facing API response.
 */

let antimatter: AntimatterContainer;
let openAIMock: OpenAIMockContainer;

const READ_POST_TOOL_NAME = 'read_post';

test.describe('Per-Tool Enable/Disable', () => {
    test.beforeAll(async () => {
        antimatter = await RunToolConfigContainer();
        openAIMock = await RunOpenAIMocks(antimatter.network);
    });

    test.afterAll(async () => {
        await openAIMock.stop();
        await antimatter.stop();
    });

    test('should disable a tool and persist the change', async ({ page }) => {
        test.setTimeout(60000);

        const amPage = new AntimatterPage(page);
        const toolConfig = new ToolConfigUIHelper(page);

        await amPage.login(antimatter.url(), adminUsername, adminPassword);
        await toolConfig.navigateToToolsTab(antimatter.url());

        // Expand the embedded server
        const serverHeader = page.getByText(/\d+\/\d+ tools? enabled/).first();
        await serverHeader.click();
        await page.waitForTimeout(500);

        // Find read_post tool - should be enabled
        await expect(page.getByText(READ_POST_TOOL_NAME, { exact: true })).toBeVisible({ timeout: 5000 });
        const toggle = toolConfig.getToolToggle(READ_POST_TOOL_NAME);
        await expect(toggle).toBeChecked();

        // Disable the tool
        await toolConfig.toggleTool(READ_POST_TOOL_NAME, false);
        await expect(toggle).not.toBeChecked();

        // Save
        await toolConfig.clickSave();

        // Reload page
        await toolConfig.navigateToToolsTab(antimatter.url());

        // Expand server again
        const serverHeader2 = page.getByText(/\d+\/\d+ tools? enabled/).first();
        await serverHeader2.click();
        await page.waitForTimeout(500);

        // Verify tool shows as disabled
        await expect(page.getByText(READ_POST_TOOL_NAME, { exact: true })).toBeVisible({ timeout: 5000 });
        const toggleAfter = toolConfig.getToolToggle(READ_POST_TOOL_NAME);
        await expect(toggleAfter).not.toBeChecked();

        // Re-enable the tool for subsequent tests
        await toolConfig.toggleTool(READ_POST_TOOL_NAME, true);
        await toolConfig.clickSave();
    });

    test('should verify disabled tool excluded from user API response', async ({ page }) => {
        test.setTimeout(60000);

        const amPage = new AntimatterPage(page);
        const toolConfig = new ToolConfigUIHelper(page);

        await amPage.login(antimatter.url(), adminUsername, adminPassword);

        // Use the API helper to check the tool list
        const apiHelper = await createToolConfigAPIHelper(antimatter);
        const adminClient = await antimatter.getAdminClient();
        const token = adminClient.getToken();

        // First, get the current tool list with all tools enabled
        const toolsBefore = await apiHelper.getUserMCPTools(token);

        // Verify tools are returned
        expect(toolsBefore.servers).toBeDefined();
        const serverBefore = toolsBefore.servers?.find((s: any) =>
            s.tools?.some((t: any) => t.name === READ_POST_TOOL_NAME),
        );
        expect(serverBefore).toBeDefined();

        // Now disable read_post via UI
        await toolConfig.navigateToToolsTab(antimatter.url());
        const serverHeader = page.getByText(/\d+\/\d+ tools? enabled/).first();
        await serverHeader.click();
        await page.waitForTimeout(500);
        await expect(page.getByText(READ_POST_TOOL_NAME, { exact: true })).toBeVisible({ timeout: 5000 });
        await toolConfig.toggleTool(READ_POST_TOOL_NAME, false);
        await toolConfig.clickSave();

        // Verify the API no longer returns read_post
        const toolsAfter = await apiHelper.getUserMCPTools(token);
        const serverAfter = toolsAfter.servers?.find((s: any) =>
            s.tools?.some((t: any) => t.name === READ_POST_TOOL_NAME),
        );
        expect(serverAfter).toBeUndefined();

        // Re-enable for cleanup
        await toolConfig.navigateToToolsTab(antimatter.url());
        const serverHeader2 = page.getByText(/\d+\/\d+ tools? enabled/).first();
        await serverHeader2.click();
        await page.waitForTimeout(500);
        await expect(page.getByText(READ_POST_TOOL_NAME, { exact: true })).toBeVisible({ timeout: 5000 });
        await toolConfig.toggleTool(READ_POST_TOOL_NAME, true);
        await toolConfig.clickSave();
    });
});

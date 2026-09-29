import fs from 'fs';
import path from 'path';

import { Locator, Page } from '@playwright/test';

import { AIMockContainer, RunAIMockSidecar } from './aimock-container';
import { AIMockFixtureFile } from './aimock-fixtures';
import { AIPlugin } from './ai-plugin';
import { LLMBotPostHelper } from './llmbot-post';
import { AntimatterPage } from './am';
import AntimatterContainer from './amcontainer';
import { RunAIMockContainer } from './plugincontainer';

export type AIMockHarness = {
    antimatter: AntimatterContainer;
    aimock: AIMockContainer;
    stop: () => Promise<void>;
};

export function loadAimockFixtureFile(fixtureRelativePath: string): AIMockFixtureFile {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'aimock', fixtureRelativePath);
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    return JSON.parse(raw) as AIMockFixtureFile;
}

const DEFAULT_AIMOCK_USERNAME = 'regularuser';
const DEFAULT_AIMOCK_PASSWORD = 'regularuser';

export async function setupAimockTestPage(
    page: Page,
    antimatterUrl: string,
    credentials: { username?: string; password?: string } = {},
): Promise<{
    amPage: AntimatterPage;
    aiPlugin: AIPlugin;
    llmBotHelper: LLMBotPostHelper;
}> {
    const amPage = new AntimatterPage(page);
    const aiPlugin = new AIPlugin(page);
    const llmBotHelper = new LLMBotPostHelper(page);

    await amPage.login(
        antimatterUrl,
        credentials.username ?? DEFAULT_AIMOCK_USERNAME,
        credentials.password ?? DEFAULT_AIMOCK_PASSWORD,
    );
    await aiPlugin.resetState();

    return { amPage, aiPlugin, llmBotHelper };
}

/**
 * setupAimockTestPage plus the prompt: sends `prompt` to the bot in a freshly
 * reset RHS and hands back the panel and the reply post that answers it.
 */
export async function askAimockBot(
    page: Page,
    antimatterUrl: string,
    prompt: string,
): Promise<{
    llmBotHelper: LLMBotPostHelper;
    rhs: Locator;
    botPost: Locator;
}> {
    const { aiPlugin, llmBotHelper } = await setupAimockTestPage(page, antimatterUrl);
    await aiPlugin.sendMessage(prompt);

    const rhs = page.getByTestId('mattermost-ai-rhs');
    return { llmBotHelper, rhs, botPost: rhs.locator('[data-testid="llm-bot-post"]').last() };
}

export async function RunAIMockHarness(options: {
    fixtureFile: string;
    bot?: Partial<Record<string, unknown>>;
    service?: Partial<Record<string, unknown>>;
}): Promise<AIMockHarness> {
    const fixtures = loadAimockFixtureFile(options.fixtureFile);
    const antimatter = await RunAIMockContainer({
        bot: options.bot,
        service: options.service,
    });
    try {
        const aimock = await RunAIMockSidecar(antimatter.network, {
            fixtures,
        });

        return {
            antimatter,
            aimock,
            stop: async () => {
                const errors: unknown[] = [];
                for (const stop of [() => aimock.stop(), () => antimatter.stop()]) {
                    try {
                        await stop();
                    } catch (error) {
                        errors.push(error);
                    }
                }

                if (errors.length > 0) {
                    throw errors[0];
                }
            },
        };
    } catch (error) {
        await antimatter.stop().catch(() => undefined);
        throw error;
    }
}

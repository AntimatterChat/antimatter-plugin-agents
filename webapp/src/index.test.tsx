// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {BotsHandler} from './redux';
import {LLMBot} from './bots';
import {ChannelAccessLevel, UserAccessLevel} from './components/system_console/bot';

// am_webapp reads window.Components/ProductApi at module load, which are absent
// in jsdom. Stub it so importing the plugin entrypoint doesn't throw.
let mockFusion = false;
jest.mock('@/am_webapp', () => ({
    AdvancedTextEditor: null,
    CreatePost: null,
    isRHSCompatable: () => false,
    isFusionUI: () => mockFusion,
    PostMessagePreview: null,
    Timestamp: null,
    ThreadViewer: null,
    DatePicker: null,
    MenuItem: null,
    MenuSeparator: null,
    useWebSocketClient: () => null,
}));

// The production build runs babel-plugin-formatjs, which injects the message
// ids that `formatMessage({defaultMessage})` needs; jest transforms with ts-jest
// only, so resolve plain-string labels to their default message instead.
jest.mock('react-intl', () => ({
    ...jest.requireActual('react-intl'),
    createIntl: () => ({
        formatMessage: ({defaultMessage}: {defaultMessage: string}) => defaultMessage,
    }),
}));

// react-bootstrap and react-router-dom are webpack externals supplied by the
// host webapp, so they are not installed here; the entrypoint's component tree
// imports them at module load.
jest.mock('react-bootstrap', () => ({OverlayTrigger: () => null, Tooltip: () => null}), {virtual: true});
jest.mock('react-router-dom', () => ({
    Link: () => null,
    Redirect: () => null,
    Route: () => null,
    Switch: () => null,
    useHistory: () => ({push: jest.fn()}),
    useLocation: () => ({pathname: '/'}),
    useParams: () => ({}),
    useRouteMatch: () => ({url: '/'}),
}), {virtual: true});

// @/client is the real HTTP boundary; stub the calls initialize() makes.
const mockGetAIBots = jest.fn();
const mockSetSiteURL = jest.fn();
jest.mock('@/client', () => ({
    getAIBots: (...args: unknown[]) => mockGetAIBots(...args),
    setSiteURL: (...args: unknown[]) => mockSetSiteURL(...args),
    doReaction: jest.fn(),
    doRunSearch: jest.fn(),
    savePreferences: jest.fn(),
}));

// The server's agents: the AI chat's agent list and tasks.
const mockGetChatAgents = jest.fn();
const mockStartAgentTask = jest.fn();
jest.mock('@/agent_chat_client', () => ({
    getChatAgents: () => mockGetChatAgents(),
    startAgentTask: (...args: unknown[]) => mockStartAgentTask(...args),
}));

function makeBot(id: string): LLMBot {
    return {
        id,
        displayName: id,
        username: id,
        lastIconUpdate: 0,
        dmChannelID: '',
        channelAccessLevel: ChannelAccessLevel.All,
        channelIDs: null,
        userAccessLevel: UserAccessLevel.All,
        userIDs: null,
        enabledMCPTools: null,
        autoEnableNewMCPTools: false,
    };
}

type WebSocketHandlers = Map<string, (msg: unknown) => void>;

// Only the registry members initialize() calls unconditionally, plus the
// channel-settings tab (its presence is what makes the bots cache load-bearing
// for a synchronous shouldRender).
function makeRegistry(websocketHandlers: WebSocketHandlers) {
    return {
        registerRightHandSidebarComponent: jest.fn(() => ({showRHSPlugin: {type: 'SHOW_AI_CHAT'}, toggleRHSPlugin: {type: 'TOGGLE_AI_CHAT'}})),
        registerChannelHeaderButtonAction: jest.fn(),
        registerSlashCommandWillBePostedHook: jest.fn(),
        registerProduct: jest.fn(),
        registerCustomRoute: jest.fn(),
        registerNeedsTeamRoute: jest.fn(),
        registerRootComponent: jest.fn(),
        registerPostDropdownSubMenuAction: jest.fn(() => ({rootRegisterMenuItem: jest.fn()})),
        registerReducer: jest.fn(),
        registerDesktopNotificationHook: jest.fn(),
        registerTranslations: jest.fn(),
        registerPostTypeComponent: jest.fn(),
        registerPostActionComponent: jest.fn(),
        registerAdminConsoleCustomSetting: jest.fn(),
        registerChannelSettingsTab: jest.fn(),
        registerWebSocketEventHandler: (event: string, handler: (msg: unknown) => void) => {
            websocketHandlers.set(event, handler);
        },
    };
}

function makeStore(dispatch: jest.Mock, siteURL = 'http://localhost:8065') {
    const state = {
        entities: {
            general: {config: {SiteURL: siteURL}},
            users: {currentUserId: ''},
            i18n: {locale: 'en'},
        },
    };
    return {
        getState: () => state,
        dispatch,
        subscribe: jest.fn(),
    };
}

async function initializePlugin(siteURL?: string, registryOverrides: Record<string, unknown> = {}) {
    const websocketHandlers: WebSocketHandlers = new Map();
    const dispatch = jest.fn();
    const registry = {...makeRegistry(websocketHandlers), ...registryOverrides};

    // The entrypoint self-registers on import, so the host hook must exist first.
    window.registerPlugin = jest.fn();

    // eslint-disable-next-line global-require
    const Plugin = require('./index').default;
    await new Plugin().initialize(registry, makeStore(dispatch, siteURL));

    return {websocketHandlers, dispatch, registry};
}

// Lets the floating fetch promises inside initialize()/the handlers settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fireWebSocketEvent(websocketHandlers: WebSocketHandlers, event: string) {
    const handler = websocketHandlers.get(event);
    if (!handler) {
        throw new Error(`no websocket handler registered for ${event}`);
    }
    handler({});
}

describe('client base URL', () => {
    beforeEach(() => {
        jest.resetModules();
        mockSetSiteURL.mockReset();
        window.basename = '/antimatter';
    });

    afterEach(() => {
        delete window.basename;
    });

    test('uses the loaded origin and basename instead of the configured SiteURL', async () => {
        await initializePlugin('https://configured.example.test/antimatter');

        expect(mockSetSiteURL).toHaveBeenCalledTimes(1);
        expect(mockSetSiteURL).toHaveBeenCalledWith(`${window.location.origin}/antimatter`);
    });
});

describe('bots cache websocket handlers', () => {
    beforeEach(() => {
        jest.resetModules();
        mockGetAIBots.mockReset();
    });

    test.each([
        ['config_changed'],
        ['custom_mattermost-ai_bots_invalidate'],
    ])('%s replaces the bots cache without a null window', async (event) => {
        const stale = [makeBot('stale')];
        const fresh = [makeBot('fresh')];
        mockGetAIBots.mockResolvedValue({bots: stale, searchEnabled: false, allowUnsafeLinks: false});

        const {websocketHandlers, dispatch} = await initializePlugin();
        await flush();
        dispatch.mockClear();

        mockGetAIBots.mockResolvedValue({bots: fresh, searchEnabled: false, allowUnsafeLinks: false});
        fireWebSocketEvent(websocketHandlers, event);
        await flush();

        // A `bots: null` dispatch would hide the channel-settings Agents tab
        // until some other surface refetched.
        expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: BotsHandler, bots: null}));
        expect(dispatch).toHaveBeenCalledWith({type: BotsHandler, bots: fresh});
    });

    test('a failed refetch leaves the previous bots in place', async () => {
        mockGetAIBots.mockResolvedValue({bots: [makeBot('stale')], searchEnabled: false, allowUnsafeLinks: false});

        const {websocketHandlers, dispatch} = await initializePlugin();
        await flush();
        dispatch.mockClear();

        mockGetAIBots.mockRejectedValue(new Error('network'));
        fireWebSocketEvent(websocketHandlers, 'config_changed');
        await flush();

        expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: BotsHandler}));
    });
});

// The AI chat is a side panel: no page of its own, no product in an app switcher, no route.
describe('the AI chat has no full page', () => {
    beforeEach(() => {
        jest.resetModules();
        mockGetAIBots.mockResolvedValue({bots: [], searchEnabled: false, allowUnsafeLinks: false});
        mockGetChatAgents.mockResolvedValue([]);
    });

    test.each([[false], [true]])('registers its side panel and nothing full-screen (Fusion: %s)', async (fusion) => {
        mockFusion = fusion;
        const {registry} = await initializePlugin();

        expect(registry.registerRightHandSidebarComponent).toHaveBeenCalledTimes(1);
        expect(registry.registerProduct).not.toHaveBeenCalled();
        expect(registry.registerCustomRoute).not.toHaveBeenCalled();
        expect(registry.registerNeedsTeamRoute).not.toHaveBeenCalled();
        mockFusion = false;
    });

    test('streams an agent\'s answer itself only in the classic web app (Fusion does it)', async () => {
        mockFusion = false;
        let {websocketHandlers} = await initializePlugin();
        expect(websocketHandlers.has('agent_post_stream')).toBe(true);

        jest.resetModules();
        mockFusion = true;
        ({websocketHandlers} = await initializePlugin());
        expect(websocketHandlers.has('agent_post_stream')).toBe(false);
        mockFusion = false;
    });
});

// Fusion's AI actions on a message ask the person's agent, through the server's agent tasks.
describe('the AI actions use the server\'s agents', () => {
    beforeEach(() => {
        jest.resetModules();
        mockFusion = true;
        mockGetAIBots.mockResolvedValue({bots: [], searchEnabled: false, allowUnsafeLinks: false});
        mockGetChatAgents.mockResolvedValue([{id: 'researcher', displayName: 'Researcher', username: 'researcher'}]);
        mockStartAgentTask.mockReset();
        (window as any).Components = {FusionConversation: () => null, FusionComposer: () => null};
    });

    afterEach(() => {
        mockFusion = false;
        delete (window as any).Components;
    });

    test.each([
        ['Summarise thread', 'summarize_thread'],
        ['Find action items', 'find_action_items'],
        ['Find open questions', 'find_open_questions'],
    ])('%s asks for %s on the message\'s thread', async (label, task) => {
        const items: Map<string, (postId: string) => Promise<void>> = new Map();
        const registerPostDropdownSubMenuAction = jest.fn(() => ({
            rootRegisterMenuItem: (text: string, action: (postId: string) => Promise<void>) => items.set(text, action),
        }));
        mockStartAgentTask.mockResolvedValue({id: 'root', channel_id: 'dm'});
        const {dispatch} = await initializePlugin('', {registerPostDropdownSubMenuAction});
        await flush();

        const action = items.get(label);
        expect(action).toBeDefined();
        await action!('post-1');

        expect(mockStartAgentTask).toHaveBeenCalledWith(expect.any(String), {task, post_id: 'post-1'});
        expect(dispatch).toHaveBeenCalledWith({type: 'SELECT_AI_POST', postId: 'root'});
        expect(dispatch).toHaveBeenCalledWith({type: 'SHOW_AI_CHAT'});
    });
});

// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import AgentChatPanel from './agent_chat_panel';

// The labels resolve to their default messages, with their values.
function format(message: string, values?: Record<string, unknown>): string {
    return message.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? ''));
}
jest.mock('react-intl', () => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');
    return {
        FormattedMessage: ({defaultMessage, values}: {defaultMessage: string; values?: Record<string, unknown>}) => ReactActual.createElement(ReactActual.Fragment, null, format(defaultMessage, values)),
        useIntl: () => ({
            formatMessage: ({defaultMessage}: {defaultMessage: string}, values?: Record<string, unknown>) => format(defaultMessage, values),
            formatDate: () => '18 Oct',
        }),
    };
});

let mockFusion = true;
jest.mock('@/am_webapp', () => ({
    isFusionUI: () => mockFusion,
}));

const mockGetChatAgents = jest.fn();
const mockGetAgentConversations = jest.fn();
const mockStartAgentTask = jest.fn();
const mockGetAgentDirectChannel = jest.fn();
jest.mock('@/agent_chat_client', () => ({
    getChatAgents: () => mockGetChatAgents(),
    getAgentConversations: (...args: unknown[]) => mockGetAgentConversations(...args),
    startAgentTask: (...args: unknown[]) => mockStartAgentTask(...args),
    getAgentDirectChannel: (...args: unknown[]) => mockGetAgentDirectChannel(...args),
    getAgentProfiles: () => Promise.resolve([]),
    agentImageURL: (id: string) => `/api/v4/users/${id}/image`,
}));

jest.mock('@/client', () => ({
    savePreferences: jest.fn(() => Promise.resolve()),
}));

const researcher = {id: 'researcher', displayName: 'Researcher', username: 'researcher', is_default: true};
const coder = {id: 'coder', displayName: 'Coder', username: 'coder'};

// A store with what the panel reads, and the actions it dispatches recorded.
function makeStore(selectedAgent = '', selectedPostId = '') {
    const actions: Array<{type: string; [key: string]: unknown}> = [];
    const initial = {
        entities: {
            users: {currentUserId: 'me', profiles: {me: {id: 'me', roles: 'system_user'}}},
            teams: {currentTeamId: 'team', teams: {team: {id: 'team', name: 'lumen'}}, myMembers: {team: {roles: 'team_user'}}},
            channels: {
                currentChannelId: 'town',
                channels: {town: {id: 'town', name: 'town-square', display_name: 'Town Square', type: 'O', delete_at: 0}},
                myMembers: {town: {last_viewed_at: 1000}},
            },
            preferences: {myPreferences: selectedAgent ? {'agents--selected_agent': {value: selectedAgent}} : {}},
        },
        'plugins-mattermost-ai': {chatAgents: null as unknown, selectedPostId},
    };
    const reducer = (state = initial, action: any) => {
        actions.push(action);
        switch (action.type) {
        case 'mattermost-ai_chat_agents':
            return {...state, 'plugins-mattermost-ai': {...state['plugins-mattermost-ai'], chatAgents: action.agents}};
        case 'SELECT_AI_POST':
            return {...state, 'plugins-mattermost-ai': {...state['plugins-mattermost-ai'], selectedPostId: action.postId}};
        default:
            return state;
        }
    };
    const store = createStore(reducer as any);
    return {store, actions};
}

function renderPanel(store: any) {
    return render(
        <Provider store={store}>
            <AgentChatPanel/>
        </Provider>,
    );
}

// Fusion lends the panel its conversation and composer: each draws exactly one text box.
function lendFusionComponents() {
    (window as any).Components = {
        FusionConversation: ({rootId, placeholder}: {rootId: string; placeholder: string}) => (
            <div data-testid='fusion-conversation'>
                {rootId}
                <textarea aria-label={placeholder}/>
            </div>
        ),
        FusionComposer: ({channelId, placeholder, onPosted}: {channelId: string; placeholder: string; onPosted: (p: unknown) => void}) => (
            <textarea
                aria-label={placeholder}
                data-channel={channelId}
                onChange={() => onPosted({id: 'new-root', channel_id: channelId})}
            />
        ),
    };
}

describe('the AI chat side panel', () => {
    beforeEach(() => {
        mockFusion = true;
        lendFusionComponents();
        mockGetChatAgents.mockResolvedValue([researcher, coder]);
        mockGetAgentConversations.mockResolvedValue([]);
        mockGetAgentDirectChannel.mockResolvedValue({channel: {id: 'dm-researcher', name: 'me__researcher', type: 'D'}, member: {channel_id: 'dm-researcher', user_id: 'me'}});
        mockStartAgentTask.mockReset();
    });

    afterEach(() => {
        delete (window as any).Components;
    });

    test('lists the agents the server gives, and only those', async () => {
        // A saved choice of an agent the person may no longer use is ignored: the default agent shows.
        const {store} = makeStore('admins-only-agent');
        renderPanel(store);

        const picker = await screen.findByTestId('ai-chat-agent-picker');
        expect((picker).textContent).toContain('Researcher');
        fireEvent.click(picker);

        const options = screen.getAllByRole('option');
        expect(options.map((o) => o.textContent)).toEqual(['Researcher@researcher', 'Coder@coder']);
        expect(screen.queryByText(/admins-only-agent/)).toBeNull();
    });

    test('has exactly one text entry to start a conversation (no second text box)', async () => {
        const {store} = makeStore();
        renderPanel(store);

        await screen.findByRole('textbox', {name: 'Ask Researcher anything'});
        expect(screen.getAllByRole('textbox')).toHaveLength(1);
        expect(screen.getByRole('textbox').getAttribute('data-channel')).toBe('dm-researcher');
    });

    test('has exactly one text entry in a conversation', async () => {
        const {store} = makeStore('', 'root-1');
        renderPanel(store);

        const conversation = await screen.findByTestId('fusion-conversation');
        expect((conversation).textContent).toContain('root-1');
        expect(screen.getAllByRole('textbox')).toHaveLength(1);
        expect(screen.getByRole('textbox', {name: 'Reply to Researcher'})).toBeTruthy();
    });

    test('opens the conversation a message starts', async () => {
        const {store} = makeStore();
        renderPanel(store);

        fireEvent.change(await screen.findByRole('textbox', {name: 'Ask Researcher anything'}), {target: {value: 'hi'}});
        await waitFor(() => expect((store.getState() as any)['plugins-mattermost-ai'].selectedPostId).toBe('new-root'));
        expect((await screen.findByTestId('fusion-conversation')).textContent).toContain('new-root');
    });

    test('a suggestion asks the agent through the server, and opens its conversation', async () => {
        mockStartAgentTask.mockResolvedValue({id: 'task-root', channel_id: 'dm-researcher'});
        const {store} = makeStore();
        renderPanel(store);

        fireEvent.click(await screen.findByRole('button', {name: 'Summarise the last 7 days'}));

        await waitFor(() => expect(mockStartAgentTask).toHaveBeenCalledWith('researcher', expect.objectContaining({task: 'summarize_channel', channel_id: 'town'})));
        await waitFor(() => expect((store.getState() as any)['plugins-mattermost-ai'].selectedPostId).toBe('task-root'));
    });

    test('lists the conversations and opens one', async () => {
        mockGetAgentConversations.mockResolvedValue([
            {root_id: 'c1', channel_id: 'dm-coder', agent_id: 'coder', title: 'Plan the release', direct: true, reply_count: 2, create_at: 1, last_reply_at: 2},
        ]);
        const {store} = makeStore();
        renderPanel(store);

        fireEvent.click(await screen.findByTestId('ai-chat-conversations-button'));
        const item = await screen.findByText('Plan the release');
        expect(mockGetAgentConversations).toHaveBeenCalledWith('', 0, 50);

        fireEvent.click(item);
        await waitFor(() => expect((store.getState() as any)['plugins-mattermost-ai'].selectedPostId).toBe('c1'));
    });

    test('with no agent to talk to, says so, with no picture', async () => {
        mockGetChatAgents.mockResolvedValue([]);
        const {store} = makeStore();
        const {container} = renderPanel(store);

        expect(await screen.findByText('No agents yet')).toBeTruthy();
        expect(screen.getByText(/Ask an admin to set one up/)).toBeTruthy();
        expect(container.querySelectorAll('img')).toHaveLength(0);
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    test('in the classic web app: no composer, the agent\'s direct message instead', async () => {
        mockFusion = false;
        const push = jest.fn();
        (window as any).WebappUtils = {browserHistory: {push}};
        const {store} = makeStore();
        renderPanel(store);

        const button = await screen.findByRole('button', {name: 'Message Researcher'});
        expect(screen.queryByRole('textbox')).toBeNull();
        fireEvent.click(button);
        expect(push).toHaveBeenCalledWith('/lumen/messages/@researcher');
        delete (window as any).WebappUtils;
    });

    test('in the classic web app, a conversation opens as a thread', async () => {
        mockFusion = false;
        mockGetAgentConversations.mockResolvedValue([
            {root_id: 'c1', channel_id: 'dm-coder', agent_id: 'coder', title: 'Plan the release', direct: true, reply_count: 2, create_at: 1, last_reply_at: 2},
        ]);
        const {store, actions} = makeStore();
        renderPanel(store);

        fireEvent.click(await screen.findByTestId('ai-chat-conversations-button'));
        fireEvent.click(await screen.findByText('Plan the release'));
        await waitFor(() => expect(actions).toContainEqual(expect.objectContaining({type: 'SELECT_POST', postId: 'c1', channelId: 'dm-coder'})));
    });
});

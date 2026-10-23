// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

import {savePreferences} from '@/client';
import {notifyToolsChanged} from '@/tools_events';

import ToolsMenu, {parseChoices, withChoice} from './tools_menu';

function format(message: string, values?: Record<string, unknown>): string {
    return message.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? ''));
}
jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: ({defaultMessage}: {defaultMessage: string}, values?: Record<string, unknown>) => format(defaultMessage, values),
    }),
}));

const mockGetAgentTools = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
jest.mock('@/agent_chat_client', () => ({
    PREFERENCE_CATEGORY_AI_TOOLS: 'ai_tools',
    PREFERENCE_NAME_AI_TOOL_CHOICES: 'choices',
    getAgentTools: (...args: unknown[]) => mockGetAgentTools(...args),
    connectMCPServer: (...args: unknown[]) => mockConnect(...args),
    disconnectMCPServer: (...args: unknown[]) => mockDisconnect(...args),
}));

jest.mock('@/client', () => ({
    savePreferences: jest.fn(() => Promise.resolve()),
}));

const sources = [
    {
        key: 'builtin',
        source: 'builtin',
        source_id: '',
        name: 'Antimatter',
        on: true,
        connected: true,
        unavailable: false,
        tools: [
            {name: 'antimatter.search_messages', title: 'Search messages', description: '', kind: 'read', on: true, auto_run: true},
            {name: 'antimatter.post_message', title: 'Post a message', description: '', kind: 'write', on: true, auto_run: false},
        ],
    },
    {key: 'mcp:jira', source: 'mcp', source_id: 'jira', name: 'Jira', on: true, auth: 'oauth', connected: false, unavailable: false, tools: []},
    {
        key: 'mcp:github',
        source: 'mcp',
        source_id: 'github',
        name: 'GitHub',
        on: true,
        auth: 'oauth',
        connected: true,
        unavailable: false,
        tools: [{name: 'mcp.github.search', title: 'Search code', description: '', kind: 'read', on: true, auto_run: false}],
    },
];

function makeStore(choices?: string) {
    const initial = {
        entities: {
            users: {currentUserId: 'maya'},
            channels: {currentChannelId: 'town'},
            preferences: {myPreferences: choices ? {'ai_tools--choices': {value: choices}} : {}},
        },
    };
    return createStore((state: any = initial, action: any) => {
        if (action.type === 'RECEIVED_PREFERENCES') {
            const mine = {...state.entities.preferences.myPreferences};
            for (const p of action.data) {
                mine[`${p.category}--${p.name}`] = {value: p.value};
            }
            return {...state, entities: {...state.entities, preferences: {myPreferences: mine}}};
        }
        return state;
    });
}

function renderMenu(store = makeStore()) {
    render(
        <Provider store={store}>
            <ToolsMenu
                agentId='researcher'
                agentName='Researcher'
            />
        </Provider>,
    );
    return store;
}

async function openMenu() {
    await act(async () => {
        fireEvent.click(screen.getByTestId('ai-chat-tools-button'));
    });
    await waitFor(() => expect(screen.getByText('Antimatter')).toBeTruthy());
}

describe('the AI chat\'s Tools menu', () => {
    beforeEach(() => {
        mockGetAgentTools.mockReset().mockResolvedValue(sources);
        mockConnect.mockReset().mockResolvedValue({authorize_url: 'https://auth.example.com/authorize?state=x'});
        mockDisconnect.mockReset().mockResolvedValue({});
        (savePreferences as jest.Mock).mockClear();
    });

    test('lists the agent\'s tools for the person, where they are', async () => {
        renderMenu();
        expect(screen.queryByTestId('ai-chat-tools-menu')).toBeNull();
        await openMenu();
        expect(mockGetAgentTools).toHaveBeenCalledWith('researcher', 'town');
        expect(screen.getByText('Search messages')).toBeTruthy();
        expect(screen.getByText('Post a message')).toBeTruthy();
        expect(screen.getAllByText('Asks you first')).toHaveLength(2);
        expect(screen.getByText('Tools Researcher may use for you')).toBeTruthy();
    });

    test('turning a tool or a source off saves the person\'s choice, for every agent', async () => {
        const store = renderMenu();
        await openMenu();
        await act(async () => {
            fireEvent.click(screen.getByRole('switch', {name: 'Use Post a message'}));
        });
        expect(savePreferences).toHaveBeenLastCalledWith('maya', [{user_id: 'maya', category: 'ai_tools', name: 'choices', value: JSON.stringify({off_sources: [], off_tools: ['antimatter.post_message']})}]);
        expect(screen.getByRole('switch', {name: 'Use Post a message'}).getAttribute('aria-checked')).toBe('false');

        await act(async () => {
            fireEvent.click(screen.getByRole('switch', {name: 'Use Antimatter'}));
        });
        expect(JSON.parse(store.getState().entities.preferences.myPreferences['ai_tools--choices'].value).off_sources).toEqual(['builtin']);
        expect(screen.queryByText('Search messages')).toBeNull();
    });

    test('a service the person hasn\'t signed in to offers the sign-in, in its own window', async () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        renderMenu();
        await openMenu();
        expect(screen.getByText('Sign in to use it with your account')).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: 'Sign in'}));
        });
        expect(mockConnect).toHaveBeenCalledWith('jira');
        expect(open).toHaveBeenCalledWith('https://auth.example.com/authorize?state=x', '_blank', 'noopener,noreferrer');
        open.mockRestore();
    });

    test('signing out forgets the person\'s sign-in, then reads the tools again', async () => {
        renderMenu();
        await openMenu();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: 'Sign out'}));
        });
        expect(mockDisconnect).toHaveBeenCalledWith('github');
        expect(mockGetAgentTools).toHaveBeenCalledTimes(2);
    });

    test('a sign-in finished elsewhere refreshes the open menu', async () => {
        renderMenu();
        await openMenu();
        await act(async () => {
            notifyToolsChanged();
        });
        expect(mockGetAgentTools).toHaveBeenCalledTimes(2);
    });

    test('an agent without tools says so', async () => {
        mockGetAgentTools.mockResolvedValue([]);
        renderMenu();
        await act(async () => {
            fireEvent.click(screen.getByTestId('ai-chat-tools-button'));
        });
        await waitFor(() => expect(screen.getByText('This agent has no tools.')).toBeTruthy());
    });

    test('choices that can\'t be read count as none', () => {
        expect(parseChoices('nope')).toEqual({off_sources: [], off_tools: []});
        expect(parseChoices('{"off_tools":["a",1]}')).toEqual({off_sources: [], off_tools: ['a']});
        expect(withChoice(['a', 'b'], 'a', true)).toEqual(['b']);
        expect(withChoice(['b'], 'a', false)).toEqual(['b', 'a']);
        expect(withChoice(['a'], 'a', false)).toEqual(['a']);
    });
});

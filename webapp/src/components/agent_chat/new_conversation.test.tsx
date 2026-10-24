// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import {act, fireEvent, render, screen} from '@testing-library/react';

import NewConversation from './new_conversation';

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
        }),
    };
});

const mockRunAgentTask = jest.fn((..._args: unknown[]) => Promise.resolve(''));
jest.mock('@/agent_chat_state', () => ({
    runAgentTask: (...args: unknown[]) => mockRunAgentTask(...args),
}));

jest.mock('@/agent_chat_client', () => ({
    getAgentConversations: () => Promise.resolve([]),
    getAgentDirectChannel: () => Promise.resolve({channel: {id: 'dm'}, member: {}}),
    agentImageURL: (id: string) => `/api/v4/users/${id}/image`,
}));

const agent = {id: 'agent1', displayName: 'Agent', username: 'agent1'};

// A store with an open, non-DM channel, and the lastViewedAt the "since" chips read.
function makeStore(channelId: string, lastViewedAt: number) {
    const initial = {
        entities: {
            users: {currentUserId: 'me'},
            channels: {
                currentChannelId: channelId,
                channels: {[channelId]: {id: channelId, name: 'town-square', display_name: 'Town Square', type: 'O', delete_at: 0}},
                myMembers: {[channelId]: {last_viewed_at: lastViewedAt}},
            },
            teams: {currentTeamId: 'team', teams: {team: {id: 'team', name: 'lumen'}}},
        },
    };
    const reducer = (state = initial) => state;
    return createStore(reducer as any);
}

function renderPanel(store: any) {
    return render(
        <Provider store={store}>
            <NewConversation
                agents={[agent]}
                agent={agent as any}
                fusion={false}
                onOpen={jest.fn()}
                onSeeAll={jest.fn()}
            />
        </Provider>,
    );
}

beforeEach(() => {
    mockRunAgentTask.mockClear();
});

// Regression test for: opening the channel moves last_viewed_at to now, which must not make "Summarise what's
// new" summarise nothing. The component must keep using the last_viewed_at it saw when the channel was opened
// (from when NewConversation first mounted for that channel), even if the store's value moves on afterwards.
test('summarise what’s new uses the last_viewed_at from when the channel was opened, not a later value', async () => {
    const store = makeStore('town', 500);
    await act(async () => {
        renderPanel(store);
    });

    // Opening the channel (e.g. VIEW_CHANNEL) bumps last_viewed_at in the store for the same channel.
    const prevState = store.getState() as any;
    const nextState = {
        ...prevState,
        entities: {
            ...prevState.entities,
            channels: {
                ...prevState.entities.channels,
                myMembers: {town: {last_viewed_at: 999999}},
            },
        },
    };
    act(() => {
        (store as any).replaceReducer(() => nextState);
    });

    await act(async () => {
        fireEvent.click(screen.getByText('Summarise what’s new'));
    });

    expect(mockRunAgentTask).toHaveBeenCalledTimes(1);
    const request = mockRunAgentTask.mock.calls[0][1] as {since: number};
    expect(request.since).toBe(500);
});

test('switching to a different channel picks up that channel’s own last_viewed_at', async () => {
    const store = makeStore('town', 500);
    let rerender: ReturnType<typeof render>['rerender'];
    await act(async () => {
        ({rerender} = renderPanel(store));
    });

    const store2 = makeStore('other', 42);
    await act(async () => {
        rerender(
            <Provider store={store2}>
                <NewConversation
                    agents={[agent]}
                    agent={agent as any}
                    fusion={false}
                    onOpen={jest.fn()}
                    onSeeAll={jest.fn()}
                />
            </Provider>,
        );
    });

    await act(async () => {
        fireEvent.click(screen.getByText('Summarise what’s new'));
    });

    expect(mockRunAgentTask).toHaveBeenCalledTimes(1);
    const request = mockRunAgentTask.mock.calls[0][1] as {since: number};
    expect(request.since).toBe(42);
});

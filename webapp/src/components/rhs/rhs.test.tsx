// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';

import Rhs from './rhs';

const mockGetAIThreads = jest.fn();
const mockGetUserMCPTools = jest.fn();
const mockGetUserToolPreferences = jest.fn();
const mockUpdateRead = jest.fn();

jest.mock('@/client', () => ({
    getAIThreads: () => mockGetAIThreads(),
    getUserMCPTools: () => mockGetUserMCPTools(),
    getUserToolPreferences: () => mockGetUserToolPreferences(),
    updateRead: (userId: string, teamId: string, postId: string, timestamp: number) => (
        mockUpdateRead(userId, teamId, postId, timestamp)
    ),
}));

type SelectorFn = (state: unknown) => unknown;
const mockUseSelector = jest.fn<unknown, [SelectorFn]>();
const mockDispatch = jest.fn();

jest.mock('react-redux', () => ({
    useSelector: (selector: SelectorFn) => mockUseSelector(selector),
    useDispatch: () => mockDispatch,
}));

const mockUseBotlist = jest.fn();

jest.mock('@/bots', () => ({
    useBotlist: () => mockUseBotlist(),
}));

jest.mock('react-intl', () => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');

    return {
        IntlProvider: ({children}: {children: React.ReactNode}) => ReactActual.createElement(ReactActual.Fragment, null, children),
        FormattedMessage: ({defaultMessage}: {defaultMessage: string}) => ReactActual.createElement(ReactActual.Fragment, null, defaultMessage),
        useIntl: () => ({
            formatMessage: ({defaultMessage}: {defaultMessage: string}) => defaultMessage,
        }),
    };
});

const mockThreadViewer = jest.fn();

jest.mock('@/am_webapp', () => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');

    return {
        ThreadViewer: (props: Record<string, unknown>) => {
            mockThreadViewer(props);
            return ReactActual.createElement('div', {'data-testid': 'rhs-thread-viewer'});
        },
    };
});

jest.mock('./rhs_header', () => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');

    return {
        __esModule: true,
        default: () => ReactActual.createElement('div', {'data-testid': 'rhs-header'}),
    };
});

jest.mock('./rhs_new_tab', () => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');

    return {
        __esModule: true,
        default: () => ReactActual.createElement('div', {'data-testid': 'rhs-new-tab'}),
    };
});

jest.mock('./thread_item', () => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');

    return {
        __esModule: true,
        default: () => ReactActual.createElement('div', {'data-testid': 'rhs-thread-item'}),
    };
});

const activeBot = {
    id: 'bot-id',
    displayName: 'Agents',
    username: 'ai',
    lastIconUpdate: 0,
    dmChannelID: 'dm-channel-id',
    channelAccessLevel: 'all',
    channelIDs: [],
    userAccessLevel: 'all',
    userIDs: [],
    teamIDs: [],
    enabledMCPTools: [],
    autoEnableNewMCPTools: false,
};

const baseState = {
    'plugins-mattermost-ai': {
        selectedPostId: 'post-id',
    },
    entities: {
        users: {
            currentUserId: 'user-id',
        },
        teams: {
            currentTeamId: 'team-id',
        },
        posts: {
            posts: {
                'post-id': {
                    id: 'post-id',
                    props: {
                        conversation_id: 'conversation-id',
                    },
                },
            },
            postsInThread: {
                'post-id': [],
            },
        },
    },
};

function renderRHS() {
    return render(
        <Rhs/>,
    );
}

describe('RHS', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetUserMCPTools.mockResolvedValue({servers: []});
        mockGetUserToolPreferences.mockResolvedValue({disabled_servers: []});
        mockUpdateRead.mockImplementation(() => Promise.resolve());
        mockUseBotlist.mockReturnValue({
            bots: [activeBot],
            activeBot,
            setActiveBot: jest.fn(),
        });
        mockUseSelector.mockImplementation((selector) => selector(baseState));
    });

    describe('without agents', () => {
        const stateWithRoles = (roles: string, permissions: string[]) => ({
            ...baseState,
            'plugins-mattermost-ai': {},
            entities: {
                ...baseState.entities,
                users: {currentUserId: 'user-id', profiles: {'user-id': {id: 'user-id', roles}}},
                roles: {roles: {[roles]: {name: roles, permissions}}},
            },
        });

        beforeEach(() => {
            mockUseBotlist.mockReturnValue({bots: [], activeBot: null, setActiveBot: jest.fn()});
        });

        test('invites people who can to create an agent', () => {
            mockUseSelector.mockImplementation((selector) => selector(stateWithRoles('system_admin', ['manage_system'])));
            renderRHS();

            expect(screen.getByText('No agents yet')).toBeTruthy();
            expect(screen.getByRole('button', {name: 'Create an agent'})).toBeTruthy();
        });

        test('tells the others to ask an admin', () => {
            mockUseSelector.mockImplementation((selector) => selector(stateWithRoles('system_user', [])));
            renderRHS();

            expect(screen.getByText('No agents yet')).toBeTruthy();
            expect(screen.getByText(/Ask your system admin/)).toBeTruthy();
            expect(screen.queryByRole('button', {name: 'Create an agent'})).toBeNull();
        });
    });

    test('renders the thread viewer when the read marker rejects for missing thread membership', async () => {
        const error = new Error('User thread membership doesn\'t exist');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => null);
        mockUpdateRead.mockRejectedValue(error);

        const {unmount} = renderRHS();

        expect(screen.getByTestId('rhs-thread-viewer')).toBeTruthy();
        await waitFor(() => {
            expect(mockUpdateRead).toHaveBeenCalledWith('user-id', 'team-id', 'post-id', expect.any(Number));
        });
        await waitFor(() => {
            expect(warn).toHaveBeenCalledWith(
                'Skipping AI thread read marker because thread membership is missing.',
                error,
            );
        });
        expect(mockThreadViewer).toHaveBeenCalledWith(expect.objectContaining({rootPostId: 'post-id'}));

        await act(async () => {
            unmount();
        });
        await act(async () => {
            await Promise.resolve();
        });
        warn.mockRestore();
    });

    test('logs generic read marker rejections', async () => {
        const error = new Error('Unable to update read marker');
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => null);
        mockUpdateRead.mockRejectedValue(error);

        const {unmount} = renderRHS();

        expect(screen.getByTestId('rhs-thread-viewer')).toBeTruthy();
        await waitFor(() => {
            expect(mockUpdateRead).toHaveBeenCalledWith('user-id', 'team-id', 'post-id', expect.any(Number));
        });
        await waitFor(() => {
            expect(errorLog).toHaveBeenCalledWith(
                'Failed to update AI thread read marker:',
                error,
            );
        });
        expect(mockThreadViewer).toHaveBeenCalledWith(expect.objectContaining({rootPostId: 'post-id'}));

        await act(async () => {
            unmount();
        });
        await act(async () => {
            await Promise.resolve();
        });
        errorLog.mockRestore();
    });
});

// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useSelector} from 'react-redux';

import {deleteAgent, getAgents, getServices} from '@/client';
import {userHasSystemPermission} from '@/utils/permissions';
import {UserAgent} from '@/types/agents';

import AgentsList from './agents_list';

jest.mock('react-intl', () => {
    const actual = jest.requireActual('react-intl');

    // Stable intl object so effects depending on `intl` don't refire every render.
    const real = actual.createIntl({locale: 'en', defaultLocale: 'en', onError: () => null});
    const intl = {
        formatMessage: (descriptor: {id?: string; defaultMessage: string}, values?: Record<string, string | number>) =>
            real.formatMessage({id: descriptor.id ?? descriptor.defaultMessage, ...descriptor}, values),
    };
    return {
        ...actual,
        useIntl: () => intl,
        FormattedMessage: ({defaultMessage}: {defaultMessage: string}) => defaultMessage,
    };
});

jest.mock('react-redux', () => ({
    useSelector: jest.fn(),
}));

jest.mock('@/client', () => ({
    getAgents: jest.fn(),
    getServices: jest.fn(),
    deleteAgent: jest.fn(),
}));

jest.mock('@/utils/permissions', () => ({
    userHasSystemPermission: jest.fn(),
}));

jest.mock('./agent_row', () => ({
    __esModule: true,
    default: ({agent, servicesLoaded, onDelete}: {agent: UserAgent; servicesLoaded: boolean; onDelete: (agent: UserAgent) => void}) => (
        <div
            data-testid='agent-row'
            data-services-loaded={String(servicesLoaded)}
        >
            {agent.displayName}
            <button
                type='button'
                onClick={() => onDelete(agent)}
            >
                {`Delete ${agent.displayName}`}
            </button>
        </div>
    ),
}));

jest.mock('./agent_config_view', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('./delete_agent_dialog', () => ({
    __esModule: true,
    default: ({onConfirm, onCancel}: {onConfirm: () => void; onCancel: () => void}) => (
        <div data-testid='delete-agent-dialog'>
            <button
                type='button'
                onClick={onConfirm}
            >
                {'Confirm delete'}
            </button>
            <button
                type='button'
                onClick={onCancel}
            >
                {'Cancel delete'}
            </button>
        </div>
    ),
}));

const mockUseSelector = useSelector as unknown as jest.Mock;
const mockGetAgents = getAgents as unknown as jest.Mock;
const mockGetServices = getServices as unknown as jest.Mock;
const mockDeleteAgent = deleteAgent as unknown as jest.Mock;
const mockUserHasSystemPermission = userHasSystemPermission as unknown as jest.Mock;

function makeAgent(id: string): UserAgent {
    return {
        id,
        name: id,
        displayName: `Agent ${id}`,
        creatorID: 'user_1',
    } as UserAgent;
}

function renderList() {
    return render(<AgentsList/>);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockUseSelector.mockImplementation((selector) => selector({
        entities: {users: {currentUserId: 'user_1'}},
    }));

    // manage_own_agent grants create permission.
    mockUserHasSystemPermission.mockImplementation((_state, _userId, permission) => permission === 'manage_own_agent');
    mockGetServices.mockResolvedValue([]);
});

describe('AgentsList create button', () => {
    test('enables Create once agents have loaded when there are no agents', async () => {
        mockGetAgents.mockResolvedValue({agents: []});

        renderList();

        const button = await screen.findByRole('button', {name: 'Create agent'}) as HTMLButtonElement;

        // The button renders disabled while agents load.
        await waitFor(() => expect(button.disabled).toBe(false));
    });

    test('Create button stays disabled while agents are loading', () => {
        mockGetAgents.mockImplementation(() => new Promise(() => {
            // Never resolves: keep the component in its loading state.
        }));

        renderList();

        const button = screen.getByRole('button', {name: 'Create agent'});
        expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    test('keeps Create button enabled regardless of agent count', async () => {
        mockGetAgents.mockResolvedValue({agents: [makeAgent('a1'), makeAgent('a2'), makeAgent('a3'), makeAgent('a4')]});

        renderList();

        await screen.findByText('Agent a1');
        const button = screen.getByRole('button', {name: 'Create agent'});
        expect((button as HTMLButtonElement).disabled).toBe(false);
    });
});

describe('AgentsList services loading', () => {
    test('does not request services for users without agent-management permission', async () => {
        mockUserHasSystemPermission.mockReturnValue(false);
        mockGetAgents.mockResolvedValue({agents: [makeAgent('a1')]});

        renderList();

        await screen.findByText('Agent a1');
        expect(mockGetServices).not.toHaveBeenCalled();
        expect(screen.queryByText('Failed to load AI services. Using the last loaded list.')).toBeNull();

        // The row must be told the services list is unknown so it never renders
        // an inactive badge for a missing service for these users.
        expect(screen.getByTestId('agent-row').getAttribute('data-services-loaded')).toBe('false');
    });

    test('loads services and shows no warning for a permitted user', async () => {
        mockGetAgents.mockResolvedValue({agents: [makeAgent('a1')]});
        mockGetServices.mockResolvedValue([
            {id: 'svc-1', name: 'Svc', type: 'openai', defaultModel: 'gpt-4', outputTokenLimit: 0, useResponsesAPI: false},
        ]);

        renderList();

        await screen.findByText('Agent a1');
        await waitFor(() => expect(screen.getByTestId('agent-row').getAttribute('data-services-loaded')).toBe('true'));
        expect(screen.queryByText('Failed to load AI services. Using the last loaded list.')).toBeNull();
    });

    test('warns when a permitted user cannot load services', async () => {
        mockGetAgents.mockResolvedValue({agents: [makeAgent('a1')]});
        mockGetServices.mockRejectedValue(new Error('forbidden'));

        renderList();

        await screen.findByText('Failed to load AI services. Using the last loaded list.');
        expect(mockGetServices).toHaveBeenCalled();
    });
});

describe('AgentsList delete refresh', () => {
    test('refetches agents after deleting an agent', async () => {
        mockGetAgents.
            mockResolvedValueOnce({agents: [makeAgent('a1')]}).
            mockResolvedValueOnce({agents: []});
        mockDeleteAgent.mockImplementation(() => Promise.resolve());

        renderList();

        await screen.findByText('Agent a1');

        fireEvent.click(screen.getByRole('button', {name: 'Delete Agent a1'}));
        fireEvent.click(screen.getByRole('button', {name: 'Confirm delete'}));
        await waitFor(() => expect(mockDeleteAgent).toHaveBeenCalledWith('a1'));
        await waitFor(() => expect(mockGetAgents).toHaveBeenCalledTimes(2));

        await waitFor(() => expect(screen.queryByText('Agent a1')).toBeNull());
        const button = screen.getByRole('button', {name: 'Create agent'});
        expect((button as HTMLButtonElement).disabled).toBe(false);
    });
});

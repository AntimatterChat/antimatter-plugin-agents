// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {chatAgentsReducer, openConversation, resolveChatAgent, runAgentTask} from './agent_chat_state';
import {makeCallsPostButtonClickedHandler} from './calls_button';
import {selectPost} from './redux_actions';

let mockFusion = true;
jest.mock('./am_webapp', () => ({
    isFusionUI: () => mockFusion,
}));

const mockStartAgentTask = jest.fn();
const mockGetChatAgents = jest.fn();
jest.mock('./agent_chat_client', () => ({
    startAgentTask: (...args: unknown[]) => mockStartAgentTask(...args),
    getChatAgents: () => mockGetChatAgents(),
}));

jest.mock('./client', () => ({savePreferences: jest.fn()}));

const researcher = {id: 'researcher', displayName: 'Researcher', username: 'researcher'};
const coder = {id: 'coder', displayName: 'Coder', username: 'coder', is_default: true};

function store(agents: unknown, selected = '') {
    const dispatch = jest.fn();
    const state = {
        entities: {preferences: {myPreferences: selected ? {'agents--selected_agent': {value: selected}} : {}}},
        'plugins-mattermost-ai': {chatAgents: agents},
    };
    return {dispatch, getState: () => state};
}

describe('the AI chat\'s agents', () => {
    test('the agent picked, if the person may still use it; else the default; else the first', () => {
        expect(resolveChatAgent([researcher, coder], 'researcher')).toBe(researcher);
        expect(resolveChatAgent([researcher, coder], 'gone')).toBe(coder);
        expect(resolveChatAgent([researcher], 'gone')).toBe(researcher);
        expect(resolveChatAgent([], 'researcher')).toBeNull();
        expect(resolveChatAgent(null, '')).toBeNull();
    });

    test('the list is what the server gave', () => {
        expect(chatAgentsReducer(null, {type: 'mattermost-ai_chat_agents', agents: [researcher]})).toEqual([researcher]);
        expect(chatAgentsReducer([researcher], {type: 'other'})).toEqual([researcher]);
    });
});

describe('agent tasks', () => {
    beforeEach(() => {
        mockFusion = true;
        mockStartAgentTask.mockReset();
        mockGetChatAgents.mockReset();
        (window as any).Components = {FusionConversation: () => null, FusionComposer: () => null};
    });

    afterEach(() => {
        delete (window as any).Components;
    });

    test('ask the person\'s agent through the server, then open the conversation in the panel', async () => {
        mockStartAgentTask.mockResolvedValue({id: 'root', channel_id: 'dm'});
        const s = store([researcher, coder], 'researcher');

        await runAgentTask(s, {task: 'summarize_thread', post_id: 'p1'});

        expect(mockStartAgentTask).toHaveBeenCalledWith('researcher', {task: 'summarize_thread', post_id: 'p1'});
        expect(s.dispatch).toHaveBeenCalledWith({type: 'SELECT_AI_POST', postId: 'root', agentId: 'researcher'});
    });

    test('loads the agents first when they aren\'t yet', async () => {
        mockGetChatAgents.mockResolvedValue([coder]);
        mockStartAgentTask.mockResolvedValue({id: 'root', channel_id: 'dm'});
        await runAgentTask(store(null), {task: 'find_open_questions', post_id: 'p1'});
        expect(mockStartAgentTask).toHaveBeenCalledWith('coder', expect.anything());
    });

    test('refuses with no agent to ask, and asks nothing', async () => {
        await expect(runAgentTask(store([]), {task: 'summarize_thread', post_id: 'p1'})).rejects.toThrow();
        expect(mockStartAgentTask).not.toHaveBeenCalled();
    });

    // The panel shows the conversation's agent while it's open; the person's pick isn't touched.
    test('a task for another agent opens its conversation with that agent, and keeps the pick', async () => {
        mockStartAgentTask.mockResolvedValue({id: 'root', channel_id: 'dm'});
        const s = store([researcher, coder], 'researcher');

        await runAgentTask(s, {task: 'summarize_channel', channel_id: 'town'}, 'coder');

        expect(s.dispatch).toHaveBeenCalledWith({type: 'SELECT_AI_POST', postId: 'root', agentId: 'coder'});
        expect(s.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: 'RECEIVED_PREFERENCES'}));
    });

    test('closing a conversation forgets its agent', () => {
        expect(selectPost('', 'coder')).toEqual({type: 'SELECT_AI_POST', postId: '', agentId: ''});
    });

    test('the classic web app opens the conversation as a thread', () => {
        mockFusion = false;
        const s = store([researcher]);
        openConversation(s, 'root', 'dm');
        expect(s.dispatch).toHaveBeenCalledWith(expect.objectContaining({type: 'SELECT_POST', postId: 'root', channelId: 'dm'}));
    });

    // Calls' "Create meeting summary" button: the agent summarises the transcription through the server.
    test('the meeting summary button asks for the transcription\'s summary', async () => {
        mockStartAgentTask.mockResolvedValue({id: 'root', channel_id: 'dm'});
        const s = store([researcher]);
        await makeCallsPostButtonClickedHandler(s)({id: 'transcription-post'});
        expect(mockStartAgentTask).toHaveBeenCalledWith('researcher', {task: 'summarize_transcription', post_id: 'transcription-post'});
    });
});

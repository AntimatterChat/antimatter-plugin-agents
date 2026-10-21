// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useMemo} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {Dispatch} from 'redux';

import {PreferenceType} from '@mattermost/types/preferences';

import {isFusionUI} from './am_webapp';
import {AgentTaskRequest, ChatAgent, getChatAgents, startAgentTask} from './agent_chat_client';
import {LLMBot, PREFERENCE_CATEGORY_AGENTS, PREFERENCE_NAME_SELECTED_AGENT, getSelectedAgentId} from './bots';
import {savePreferences} from './client';
import manifest from './manifest';
import {openRHS, selectPost} from './redux_actions';
import {ChannelAccessLevel, UserAccessLevel} from './components/system_console/bot';

// The AI chat's state (Antimatter): the server's agents the person may use, which one they picked (the shared
// "agents / selected_agent" preference), and the conversation the side panel shows (selectedPostId).

export const ChatAgentsReceived = manifest.id + '_chat_agents';

export function chatAgentsReducer(state: ChatAgent[] | null = null, action: {type: string; agents?: ChatAgent[]}) {
    if (action.type === ChatAgentsReceived) {
        return action.agents ?? [];
    }
    return state;
}

// The host's store state (its GlobalState and the apps' slices).
type State = any;

export const chatAgentsFromState = (state: State): ChatAgent[] | null => state['plugins-' + manifest.id]?.chatAgents ?? null;

export const openConversationIdFromState = (state: State): string => state['plugins-' + manifest.id]?.selectedPostId ?? '';

// resolveChatAgent picks the agent the person chose, if they may still use it; else the default; else the first.
export function resolveChatAgent(agents: ChatAgent[] | null, preferredId: string): ChatAgent | null {
    if (!agents || agents.length === 0) {
        return null;
    }
    return agents.find((a) => a.id === preferredId) ?? agents.find((a) => a.is_default) ?? agents[0];
}

// fetchChatAgents loads the agents the person may use. A failure keeps what was there (an empty list at first).
export async function fetchChatAgents(dispatch: Dispatch): Promise<ChatAgent[] | null> {
    try {
        const agents = await getChatAgents();
        dispatch({type: ChatAgentsReceived, agents});
        return agents;
    } catch {
        return null;
    }
}

export function useChatAgents() {
    const agents = useSelector(chatAgentsFromState);
    const selectedId = useSelector(getSelectedAgentId);
    const currentUserId = useSelector((state: State) => state.entities.users.currentUserId);
    const dispatch = useDispatch();

    useEffect(() => {
        if (agents === null) {
            fetchChatAgents(dispatch);
        }
    }, [agents, dispatch]);

    const agent = useMemo(() => resolveChatAgent(agents, selectedId), [agents, selectedId]);

    const selectAgent = useCallback((picked: ChatAgent) => {
        if (!currentUserId) {
            return;
        }
        const preference: PreferenceType = {
            user_id: currentUserId,
            category: PREFERENCE_CATEGORY_AGENTS,
            name: PREFERENCE_NAME_SELECTED_AGENT,
            value: picked.id,
        };
        dispatch({type: 'RECEIVED_PREFERENCES', data: [preference]});
        savePreferences(currentUserId, [preference]).catch(() => { /* best effort */ });
    }, [currentUserId, dispatch]);

    return {agents, agent, selectAgent};
}

// chatAgentAsBot gives a server agent the shape of the app's bots, for the menus that pick one (BotDropdown).
export function chatAgentAsBot(agent: ChatAgent): LLMBot {
    return {
        id: agent.id,
        displayName: agent.displayName || agent.username,
        username: agent.username,
        lastIconUpdate: 0,
        dmChannelID: '',
        channelAccessLevel: ChannelAccessLevel.All,
        channelIDs: null,
        userAccessLevel: UserAccessLevel.All,
        userIDs: null,
        enabledMCPTools: null,
        autoEnableNewMCPTools: false,
        isDefault: agent.is_default,
    };
}

// useChatAgentBotlist is useChatAgents for the menus that list bots: the server's agents as bots.
export function useChatAgentBotlist() {
    const {agents, agent, selectAgent} = useChatAgents();
    const bots = useMemo(() => (agents ? agents.map(chatAgentAsBot) : null), [agents]);
    const activeBot = useMemo(() => (agent ? chatAgentAsBot(agent) : null), [agent]);
    const setActiveBot = useCallback((bot: LLMBot) => {
        const picked = agents?.find((a) => a.id === bot.id);
        if (picked) {
            selectAgent(picked);
        }
    }, [agents, selectAgent]);
    return {bots, activeBot, setActiveBot};
}

type Store = {dispatch: Dispatch; getState: () => State};

// usesFusionConversation tells whether Fusion lends the panel its conversation and composer (Fusion's
// plugins/export.ts): then a conversation shows in the AI chat's side panel.
export function usesFusionConversation(): boolean {
    const components = (window as any).Components;
    return isFusionUI() && Boolean(components?.FusionConversation && components?.FusionComposer);
}

// openConversation shows a conversation: in Fusion, in the AI chat's side panel; in the classic web app, which has no
// conversation view in the panel, as a thread in its own side panel (the thread is in the direct message with the
// agent, or in the channel where it was asked).
export function openConversation(store: Store, rootId: string, channelId: string) {
    if (usesFusionConversation()) {
        store.dispatch(selectPost(rootId));
        store.dispatch(openRHS());
        return;
    }
    store.dispatch({type: 'SELECT_POST', postId: rootId, channelId, timestamp: Date.now()} as any);
}

// runAgentTask asks the person's agent (or the one given) for a task, then shows the conversation it starts.
export async function runAgentTask(store: Store, request: AgentTaskRequest, agentId?: string): Promise<string> {
    let id = agentId;
    if (!id) {
        let agents = chatAgentsFromState(store.getState());
        if (agents === null) {
            agents = await fetchChatAgents(store.dispatch);
        }
        id = resolveChatAgent(agents, getSelectedAgentId(store.getState()))?.id;
    }
    if (!id) {
        throw new Error('no agent to ask');
    }
    const post = await startAgentTask(id, request);
    openConversation(store, post.id, post.channel_id);
    return post.id;
}

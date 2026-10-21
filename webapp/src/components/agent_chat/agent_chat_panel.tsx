// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector, useStore} from 'react-redux';
import styled from 'styled-components';

import {AgentConversation, ChatAgent, getAgentProfiles} from '@/agent_chat_client';
import {fetchChatAgents, openConversation, openConversationIdFromState, useChatAgents, usesFusionConversation} from '@/agent_chat_state';
import {selectPost} from '@/redux_actions';

import AgentPicker from './agent_picker';
import ConversationList from './conversation_list';
import {BackIcon, ComposeIcon, ListIcon, SparkleIcon} from './icons';
import NewConversation from './new_conversation';
import NoAgents from './no_agents';
import {IconButton, Panel, PanelHeader, t} from './styles';

// The AI chat (Antimatter) is this side panel: a user of the server's agents, not their manager. The person picks
// one of the agents they may use; the panel lists their conversations with agents and shows one, with Fusion's
// messages (an answer streams in as the agent writes it) and Fusion's composer: one text entry, never two. The
// server answers: the agent runtime, as for any message to an agent. The classic web app gets the same panel without
// a conversation view or composer: a conversation opens in the direct message it's in.

type View = 'new' | 'list';

export default function AgentChatPanel() {
    const intl = useIntl();
    const dispatch = useDispatch();
    const store = useStore();
    const {agents, agent, selectAgent} = useChatAgents();
    const conversationId = useSelector(openConversationIdFromState);
    const profiles = useSelector((state: any) => state.entities?.users?.profiles);
    const [view, setView] = useState<View>('new');
    const fusion = usesFusionConversation();

    // The list is read again each time the panel opens: an admin may have given or taken an agent.
    useEffect(() => {
        fetchChatAgents(dispatch);
    }, [dispatch]);

    // The agents' accounts, for their names and live activity in Fusion.
    const missing = (agents ?? []).filter((a) => !profiles?.[a.id]).map((a) => a.id).join(',');
    useEffect(() => {
        if (!missing) {
            return;
        }
        getAgentProfiles(missing.split(',')).then((users) => {
            dispatch({type: 'RECEIVED_PROFILES_LIST', data: users});
        }).catch(() => { /* names from the agents list are enough */ });
    }, [missing, dispatch]);

    if (agents === null) {
        return <Panel data-testid='ai-chat-panel'/>;
    }
    if (agents.length === 0 || !agent) {
        return (
            <Panel data-testid='ai-chat-panel'>
                <NoAgents/>
            </Panel>
        );
    }

    const open = (rootId: string, channelId: string, agentId?: string) => {
        const other = agentId && agentId !== agent.id ? agents.find((a) => a.id === agentId) : null;
        if (other) {
            selectAgent(other);
        }
        openConversation(store as any, rootId, channelId);
    };
    const home = (next: View) => {
        dispatch(selectPost(''));
        setView(next);
    };
    const pick = (picked: ChatAgent) => {
        selectAgent(picked);
        home('new');
    };

    const showConversation = fusion && Boolean(conversationId);
    const FusionConversation = (window as any).Components?.FusionConversation;
    const name = agent.displayName || agent.username;

    let body: React.ReactNode;
    if (showConversation) {
        body = (
            <FusionConversation
                key={conversationId}
                rootId={conversationId}
                placeholder={intl.formatMessage({defaultMessage: 'Reply to {name}', description: 'AI chat side panel: placeholder of the composer in a conversation with an agent. {name} is the agent.'}, {name})}
            />
        );
    } else if (view === 'list') {
        body = (
            <ConversationList
                agents={agents}
                onOpen={(c: AgentConversation) => open(c.root_id, c.channel_id, c.agent_id)}
            />
        );
    } else {
        body = (
            <NewConversation
                agents={agents}
                agent={agent}
                fusion={fusion}
                onOpen={open}
                onSeeAll={() => home('list')}
            />
        );
    }

    return (
        <Panel data-testid='ai-chat-panel'>
            <PanelHeader>
                {(showConversation || view === 'list') && (
                    <IconButton
                        type='button'
                        aria-label={intl.formatMessage({defaultMessage: 'Back', description: 'AI chat side panel: goes back from a conversation or the list of conversations to the start.'})}
                        title={intl.formatMessage({defaultMessage: 'Back', description: 'AI chat side panel: goes back from a conversation or the list of conversations to the start.'})}
                        onClick={() => home('new')}
                    >
                        <BackIcon/>
                    </IconButton>
                )}
                <AgentPicker
                    agents={agents}
                    agent={agent}
                    onSelect={pick}
                />
                <IconButton
                    type='button'
                    aria-pressed={view === 'list' && !showConversation}
                    aria-label={intl.formatMessage({defaultMessage: 'Conversations', description: 'AI chat side panel: shows the list of the person\'s conversations with agents.'})}
                    title={intl.formatMessage({defaultMessage: 'Conversations', description: 'AI chat side panel: shows the list of the person\'s conversations with agents.'})}
                    onClick={() => home(view === 'list' && !showConversation ? 'new' : 'list')}
                    data-testid='ai-chat-conversations-button'
                >
                    <ListIcon/>
                </IconButton>
                <IconButton
                    type='button'
                    aria-label={intl.formatMessage({defaultMessage: 'New conversation', description: 'AI chat side panel: starts a new conversation with the agent.'})}
                    title={intl.formatMessage({defaultMessage: 'New conversation', description: 'AI chat side panel: starts a new conversation with the agent.'})}
                    onClick={() => home('new')}
                    data-testid='ai-chat-new-button'
                >
                    <ComposeIcon/>
                </IconButton>
            </PanelHeader>
            {body}
        </Panel>
    );
}

// PanelTitle is the side panel's title: the app's name, without a picture.
export function PanelTitle() {
    return (
        <TitleRow>
            <SparkleIcon size={18}/>
            <FormattedMessage
                defaultMessage='AI chat'
                description='Title of the AI chat side panel (the app’s name).'
            />
        </TitleRow>
    );
}

const TitleRow = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: ${t.text};
`;

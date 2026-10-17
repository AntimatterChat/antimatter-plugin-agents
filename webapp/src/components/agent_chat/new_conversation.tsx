// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector, useStore} from 'react-redux';
import styled from 'styled-components';

import {AgentConversation, AgentTaskRequest, ChatAgent, agentImageURL, getAgentDirectChannel} from '@/agent_chat_client';
import {runAgentTask} from '@/agent_chat_state';

import ConversationList from './conversation_list';
import {Avatar, Body, Center, Chip, Chips, ErrorText, PrimaryButton, SectionHeading, Text, Title, t} from './styles';

const DAY = 24 * 60 * 60 * 1000;

type Props = {
    agents: ChatAgent[];
    agent: ChatAgent;

    // Fusion's composer is there (window.Components.FusionComposer): the panel writes to the agent itself.
    fusion: boolean;
    onOpen: (rootId: string, channelId: string, agentId?: string) => void;
    onSeeAll: () => void;
};

// NewConversation is where a conversation with the agent starts: the agent, what it can do with the channel being
// read (summaries, as tasks the server runs for the person), the latest conversations, and the one composer, writing
// to the person's direct message with the agent. The classic web app has no composer here: it opens that direct
// message instead.
export default function NewConversation({agents, agent, fusion, onOpen, onSeeAll}: Props) {
    const intl = useIntl();
    const dispatch = useDispatch();
    const store = useStore();
    const currentUserId = useSelector((state: any) => state.entities.users.currentUserId);
    const channelId = useSelector((state: any) => state.entities.channels.currentChannelId);
    const channel = useSelector((state: any) => state.entities.channels.channels[channelId]);
    const lastViewedAt = useSelector((state: any) => state.entities.channels.myMembers?.[channelId]?.last_viewed_at || 0);
    const teamName = useSelector((state: any) => state.entities.teams.teams?.[state.entities.teams.currentTeamId]?.name || '');
    const [dmId, setDmId] = useState('');
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [taskFailed, setTaskFailed] = useState(false);
    const name = agent.displayName || agent.username;

    // The direct message with the agent, where the composer writes; the store learns it, as when it's opened.
    useEffect(() => {
        if (!fusion || !currentUserId) {
            return undefined;
        }
        let cancelled = false;
        setDmId('');
        setFailed(false);
        getAgentDirectChannel(currentUserId, agent.id).then(({channel: dm, member}) => {
            if (cancelled) {
                return;
            }
            dispatch({type: 'RECEIVED_CHANNEL', data: dm});
            dispatch({type: 'RECEIVED_MY_CHANNEL_MEMBER', data: member});
            setDmId(dm.id);
        }).catch(() => {
            if (!cancelled) {
                setFailed(true);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [fusion, currentUserId, agent.id, dispatch]);

    // What the agent can do with the channel being read; not in the direct message with it.
    const aboutChannel = channel && channel.delete_at === 0 && !(channel.type === 'D' && channel.name.includes(agent.id));
    const channelLabel = channel && (channel.type === 'O' || channel.type === 'P') ? `~${channel.display_name}` : intl.formatMessage({defaultMessage: 'this conversation', description: 'AI chat side panel: stands for a direct or group message in the suggestions, e.g. "Summarise this conversation".'});

    const task = async (request: AgentTaskRequest) => {
        setBusy(true);
        setTaskFailed(false);
        try {
            await runAgentTask(store as any, request, agent.id);
        } catch {
            setTaskFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const FusionComposer = (window as any).Components?.FusionComposer;

    return (
        <>
            <Body data-testid='ai-chat-new'>
                <Intro>
                    <Avatar
                        src={agentImageURL(agent.id)}
                        alt=''
                        $size={56}
                    />
                    <Title>
                        <FormattedMessage
                            defaultMessage='Ask {name}'
                            description='AI chat side panel: title of a new conversation with an agent. {name} is the agent.'
                            values={{name}}
                        />
                    </Title>
                    <Text>
                        <FormattedMessage
                            defaultMessage='Your conversations with {name} are direct messages: they’re here, and in your messages.'
                            description='AI chat side panel: under the title of a new conversation with an agent. {name} is the agent.'
                            values={{name}}
                        />
                    </Text>
                    {!fusion && (
                        <PrimaryButton
                            type='button'
                            onClick={() => window.WebappUtils?.browserHistory?.push(`/${teamName}/messages/@${agent.username}`)}
                        >
                            <FormattedMessage
                                defaultMessage='Message {name}'
                                description='AI chat side panel (classic web app): opens the person’s direct message with the agent. {name} is the agent.'
                                values={{name}}
                            />
                        </PrimaryButton>
                    )}
                </Intro>
                {aboutChannel && (
                    <section>
                        <SectionHeading>
                            <FormattedMessage
                                defaultMessage='About {channel}'
                                description='AI chat side panel: heading of the suggestions about the channel being read. {channel} is ~channel or "this conversation".'
                                values={{channel: channelLabel}}
                            />
                        </SectionHeading>
                        <Chips>
                            {lastViewedAt > 0 && (
                                <Chip
                                    type='button'
                                    disabled={busy}
                                    onClick={() => task({task: 'summarize_channel', channel_id: channelId, since: lastViewedAt})}
                                >
                                    <FormattedMessage
                                        defaultMessage='Summarise what’s new'
                                        description='AI chat side panel: asks the agent to summarise the channel’s messages since the person last read it.'
                                    />
                                </Chip>
                            )}
                            <Chip
                                type='button'
                                disabled={busy}
                                onClick={() => task({task: 'summarize_channel', channel_id: channelId, since: Date.now() - (7 * DAY)})}
                            >
                                <FormattedMessage
                                    defaultMessage='Summarise the last 7 days'
                                    description='AI chat side panel: asks the agent to summarise the channel’s last week.'
                                />
                            </Chip>
                            <Chip
                                type='button'
                                disabled={busy}
                                onClick={() => task({task: 'find_action_items', channel_id: channelId, since: Date.now() - (7 * DAY)})}
                            >
                                <FormattedMessage
                                    defaultMessage='Action items this week'
                                    description='AI chat side panel: asks the agent for the action items of the channel’s last week.'
                                />
                            </Chip>
                        </Chips>
                        {taskFailed && (
                            <ErrorText>
                                <FormattedMessage
                                    defaultMessage='{name} couldn’t be asked. Try again in a moment.'
                                    description='AI chat side panel: asking the agent for a summary failed. {name} is the agent.'
                                    values={{name}}
                                />
                            </ErrorText>
                        )}
                    </section>
                )}
                <ConversationList
                    agents={agents}
                    agentId={agent.id}
                    limit={3}
                    onOpen={(c: AgentConversation) => onOpen(c.root_id, c.channel_id, c.agent_id)}
                    onSeeAll={onSeeAll}
                />
            </Body>
            {fusion && failed && (
                <ErrorText>
                    <FormattedMessage
                        defaultMessage='Your conversation with {name} couldn’t be opened.'
                        description='AI chat side panel: the direct message with the agent couldn’t be made or loaded. {name} is the agent.'
                        values={{name}}
                    />
                </ErrorText>
            )}
            {fusion && FusionComposer && dmId && (
                <ComposerSlot>
                    <FusionComposer
                        key={dmId}
                        channelId={dmId}
                        placeholder={intl.formatMessage({defaultMessage: 'Ask {name} anything', description: 'AI chat side panel: placeholder of the composer of a new conversation with an agent. {name} is the agent.'}, {name})}
                        onPosted={(post: {id: string; channel_id: string}) => onOpen(post.id, post.channel_id, agent.id)}
                    />
                </ComposerSlot>
            )}
        </>
    );
}

const Intro = styled(Center)`
    flex: none;
    padding-top: 28px;
`;

const ComposerSlot = styled.div`
    flex: none;
    padding-top: 6px;
    border-top: 1px solid ${t.line};
`;

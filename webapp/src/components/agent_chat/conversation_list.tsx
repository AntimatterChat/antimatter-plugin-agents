// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import styled from 'styled-components';

import {AgentConversation, ChatAgent, agentImageURL, getAgentConversations} from '@/agent_chat_client';

import {Avatar, Body, Center, ErrorText, SectionHeading, Text, Title, t} from './styles';

const PAGE = 50;

type Props = {
    agents: ChatAgent[];

    // Only this agent's conversations, when given (the recent ones on the start view).
    agentId?: string;
    limit?: number;
    onOpen: (conversation: AgentConversation) => void;
    onSeeAll?: () => void;
};

// ConversationList lists the person's conversations with agents, the most recent first: the threads they started in
// their direct messages with the agents, and the threads elsewhere an agent replied in that they follow. The server
// lists only the agents they may use and what they can still read.
export default function ConversationList({agents, agentId, limit, onOpen, onSeeAll}: Props) {
    const intl = useIntl();
    const [conversations, setConversations] = useState<AgentConversation[] | null>(null);
    const [more, setMore] = useState(false);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async (before = 0) => {
        try {
            const page = await getAgentConversations(agentId, before, limit ?? PAGE);
            setFailed(false);
            setMore(!limit && page.length === PAGE);
            setConversations((prev) => (before && prev ? [...prev, ...page] : page));
        } catch {
            setFailed(true);
            setConversations((prev) => prev ?? []);
        }
    }, [agentId, limit]);

    useEffect(() => {
        setConversations(null);
        load();
    }, [load]);

    if (conversations === null) {
        return null;
    }

    const agentName = (id: string) => {
        const a = agents.find((x) => x.id === id);
        return a ? (a.displayName || a.username) : '';
    };

    if (conversations.length === 0) {
        if (limit) {
            return failed ? <ErrorText><FormattedMessage defaultMessage='Your conversations couldn’t be loaded.' description='AI chat side panel: the list of conversations with agents failed to load.'/></ErrorText> : null;
        }
        return (
            <Body data-testid='ai-chat-conversations'>
                <Center>
                    <Title>
                        <FormattedMessage
                            defaultMessage='No conversations yet'
                            description='AI chat side panel: title of the empty list of conversations with agents.'
                        />
                    </Title>
                    <Text>
                        {failed ? (
                            <FormattedMessage
                                defaultMessage='Your conversations couldn’t be loaded.'
                                description='AI chat side panel: the list of conversations with agents failed to load.'
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage='What you ask an agent, here or in a message, shows up here.'
                                description='AI chat side panel: text of the empty list of conversations with agents.'
                            />
                        )}
                    </Text>
                </Center>
            </Body>
        );
    }

    const list = (
        <Items
            role='list'
            aria-label={intl.formatMessage({defaultMessage: 'Conversations with agents', description: 'AI chat side panel: label of the list of the person\'s conversations with agents, for screen readers.'})}
        >
            {conversations.map((c) => (
                <li key={c.root_id}>
                    <Item
                        type='button'
                        onClick={() => onOpen(c)}
                        data-testid='ai-chat-conversation'
                    >
                        <Avatar
                            src={agentImageURL(c.agent_id)}
                            alt=''
                            $size={28}
                        />
                        <ItemText>
                            <ItemTitle>
                                {c.title || intl.formatMessage({defaultMessage: 'Untitled conversation', description: 'AI chat side panel: a conversation with an agent whose first message has no text (only files).'})}
                            </ItemTitle>
                            <ItemMeta>
                                {[
                                    agentName(c.agent_id),
                                    c.direct ? '' : intl.formatMessage({defaultMessage: 'in a channel', description: 'AI chat side panel: a conversation with an agent that is a thread in a channel (not the direct message with the agent).'}),
                                    intl.formatMessage({defaultMessage: '{count, plural, one {# reply} other {# replies}}', description: 'AI chat side panel: the number of replies in a conversation with an agent.'}, {count: c.reply_count}),
                                    intl.formatDate(Math.max(c.create_at, c.last_reply_at), {month: 'short', day: 'numeric'}),
                                ].filter(Boolean).join(' · ')}
                            </ItemMeta>
                        </ItemText>
                    </Item>
                </li>
            ))}
        </Items>
    );

    if (limit) {
        return (
            <section data-testid='ai-chat-recent'>
                <SectionHeading>
                    <FormattedMessage
                        defaultMessage='Recent'
                        description='AI chat side panel: heading of the few latest conversations with the agent, on the start view.'
                    />
                </SectionHeading>
                {list}
                {onSeeAll && conversations.length >= limit && (
                    <SeeAll
                        type='button'
                        onClick={onSeeAll}
                    >
                        <FormattedMessage
                            defaultMessage='See all conversations'
                            description='AI chat side panel: link from the recent conversations to the full list.'
                        />
                    </SeeAll>
                )}
            </section>
        );
    }

    return (
        <Body data-testid='ai-chat-conversations'>
            {list}
            {failed && <ErrorText><FormattedMessage defaultMessage='Your conversations couldn’t be loaded.' description='AI chat side panel: the list of conversations with agents failed to load.'/></ErrorText>}
            {more && (
                <SeeAll
                    type='button'
                    onClick={() => {
                        const last = conversations[conversations.length - 1];
                        load(Math.max(last.create_at, last.last_reply_at));
                    }}
                >
                    <FormattedMessage
                        defaultMessage='Show older conversations'
                        description='AI chat side panel: loads the next page of older conversations with agents.'
                    />
                </SeeAll>
            )}
        </Body>
    );
}

const Items = styled.ul`
    list-style: none;
    margin: 0;
    padding: 4px 8px;
`;

const Item = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: ${t.text};
    text-align: left;
    cursor: pointer;

    &:hover, &:focus-visible {
        background: ${t.hover};
        outline: none;
    }
`;

const ItemText = styled.span`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
`;

const ItemTitle = styled.span`
    font-size: 14px;
    font-weight: 600;
    line-height: 19px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ItemMeta = styled.span`
    font-size: 12px;
    line-height: 16px;
    color: ${t.muted};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const SeeAll = styled.button`
    align-self: flex-start;
    margin: 4px 16px 12px;
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: ${t.accent};
    font: 600 12px/16px ${t.fontUI};
    cursor: pointer;

    &:hover {
        text-decoration: underline;
    }
`;

// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import styled from 'styled-components';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import {GlobalState} from '@mattermost/types/store';

import {doChannelAnalysis} from '@/client';
import {LLMBot} from '@/bots';

import {Button} from './common';

const Section = styled.div`
    margin-top: 16px;
`;

const Heading = styled.div`
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--center-channel-color-rgb), 0.56);
    margin-bottom: 8px;
`;

const Chips = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const Chip = styled(Button)`
    color: rgb(var(--link-color-rgb));
    background-color: rgba(var(--button-bg-rgb), 0.08);
    font-weight: 600;
    font-size: 12px;
    line-height: 16px;

    &:hover {
        background-color: rgba(var(--button-bg-rgb), 0.12);
    }
`;

const AskForm = styled.form`
    display: flex;
    gap: 8px;
    margin-top: 8px;

    input {
        flex: 1;
        min-width: 0;
        height: 32px;
        padding: 0 10px;
        border-radius: 6px;
        border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
        background: var(--center-channel-bg);
        color: var(--center-channel-color);
    }
`;

type Props = {
    activeBot: LLMBot | null;
    selectPost: (postId: string) => void;
    setCurrentTab: (tab: string) => void;
};

// ChannelSuggestions offers, in the panel, what Agents can do with the channel being read: summarize its unread
// messages or its last days, or answer a question about it (what the channel header's "Ask Agents" button did).
const ChannelSuggestions = ({activeBot, selectPost, setCurrentTab}: Props) => {
    const intl = useIntl();
    const channelId = useSelector((state: GlobalState) => state.entities.channels.currentChannelId);
    const teamId = useSelector((state: GlobalState) => state.entities.teams.currentTeamId);
    const channel = useSelector((state: GlobalState) => state.entities.channels.channels[channelId]);
    const lastViewedAt = useSelector((state: GlobalState) => state.entities.channels.myMembers[channelId]?.last_viewed_at || 0);
    const [question, setQuestion] = useState('');
    const [busy, setBusy] = useState(false);

    // Not in the conversations with the agents themselves.
    if (!activeBot || !channel || channel.id === activeBot.dmChannelID) {
        return null;
    }

    const analyze = async (options: Record<string, unknown>) => {
        setBusy(true);
        try {
            const result = await doChannelAnalysis(channelId, 'summarize_channel', activeBot.username, {...options, team_id: teamId});
            selectPost(result.postid);
            setCurrentTab('thread');
        } finally {
            setBusy(false);
        }
    };

    const name = channel.type === 'D' || channel.type === 'G' ? intl.formatMessage({defaultMessage: 'this conversation'}) : `#${channel.display_name}`;
    return (
        <Section>
            <Heading>
                <FormattedMessage
                    defaultMessage='About {name}'
                    values={{name}}
                />
            </Heading>
            <Chips>
                <Chip
                    disabled={busy}
                    onClick={() => analyze({analysis_type: 'summarize_unreads', since: new Date(lastViewedAt).toISOString()})}
                >
                    <FormattedMessage defaultMessage='Summarize unreads'/>
                </Chip>
                <Chip
                    disabled={busy}
                    onClick={() => analyze({analysis_type: 'days', days: 7})}
                >
                    <FormattedMessage defaultMessage='Summarize the last 7 days'/>
                </Chip>
                <Chip
                    disabled={busy}
                    onClick={() => analyze({analysis_type: 'days', days: 14})}
                >
                    <FormattedMessage defaultMessage='Summarize the last 14 days'/>
                </Chip>
            </Chips>
            <AskForm
                onSubmit={(e) => {
                    e.preventDefault();
                    if (question.trim() && !busy) {
                        analyze({analysis_type: 'custom', prompt: question.trim()});
                        setQuestion('');
                    }
                }}
            >
                <input
                    value={question}
                    placeholder={intl.formatMessage({defaultMessage: 'Ask about {name}…'}, {name})}
                    aria-label={intl.formatMessage({defaultMessage: 'Ask about {name}'}, {name})}
                    onChange={(e) => setQuestion(e.target.value)}
                />
            </AskForm>
        </Section>
    );
};

export default ChannelSuggestions;

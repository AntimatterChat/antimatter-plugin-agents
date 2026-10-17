// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled from 'styled-components';
import {FormattedMessage} from 'react-intl';

import {useStore} from 'react-redux';

import {AgentTaskName} from '@/agent_chat_client';
import {runAgentTask, useChatAgentBotlist} from '@/agent_chat_state';

import IconAI from './assets/icon_ai';
import IconSparkleCheckmark from './assets/icon_sparkle_checkmark';
import IconSparkleQuestion from './assets/icon_sparkle_question';
import IconThreadSummarization from './assets/icon_thread_summarization';

import DotMenu, {DropdownMenu, DropdownMenuItem} from './dot_menu';
import {Divider, DropdownInfoOnlyVisibleToYou} from './dropdown_info';
import {DropdownBotSelector} from './bot_selector';

const AskAIButton = styled(DotMenu)`
	display: flex;
	height: 24px;
	align-items: center;
	align-self: center;
	gap: 6px;
	color: rgba(var(--new-message-separator-rgb), 1);
	background: rgba(var(--new-message-separator-rgb), 0.08);
	width: auto;
	padding: 4px 10px;
	margin-left: 4px;
	border-radius: 4px;
	pointer-events: auto;

	font-size: 11px;
	font-weight: 600;
	line-height: 16px;
	letter-spacing: 0.22px;

	&:hover {
		background: rgba(var(--new-message-separator-rgb), 0.12);
		color: rgba(var(--new-message-separator-rgb), 1);
	}

	&:active {
		background: rgba(var(--new-message-separator-rgb), 0.16);
		color: rgba(var(--new-message-separator-rgb), 1);
	}
`;

const SmallerIconAI = styled(IconAI)`
	width: 15px;
	height: 15px;
`;

const DropdownMenuItemStyled = styled(DropdownMenuItem)`
	display: flex;
	align-items: center;
	gap: 6px;
`;

const IconSparkleCheckmarkStyled = styled(IconSparkleCheckmark)`
	color: rgba(var(--center-channel-color-rgb), 0.56);
`;

const IconSparkleQuestionStyled = styled(IconSparkleQuestion)`
	color: rgba(var(--center-channel-color-rgb), 0.56);
`;

const StyledDropdownMenu = styled(DropdownMenu)`
	min-width: 240px;
`;

// ChannelID is undefined for threads view and threadID is undefined for channel view
interface Props {
    lastViewedAt: number;
    channelId: string;
    threadId: string;
}

// The "Ask AI" menu on the new-messages line: the person's agent works on the messages since they last read the
// channel, through the server (agent tasks), and the AI chat opens on the conversation.
const UnreadsSumarize = (props: Props) => {
    const store = useStore();
    const {bots, activeBot, setActiveBot} = useChatAgentBotlist();

    const ask = (task: AgentTaskName) => async () => {
        try {
            await runAgentTask(store as any, {task, channel_id: props.channelId, since: props.lastViewedAt}, activeBot?.id);
        } catch (e) {
            console.error('Could not ask an agent', e); // eslint-disable-line no-console
        }
    };
    const summarizeNew = ask('summarize_channel');
    const actionItems = ask('find_action_items');
    const openQuestions = ask('find_open_questions');

    if (bots && bots.length === 0) {
        // No bots available (either unconfigured or filtered by permissions)
        return null;
    }

    return (
        <AskAIButton
            icon={<><SmallerIconAI/>
                <FormattedMessage defaultMessage=' Ask AI'/>
            </>}
            dropdownMenu={StyledDropdownMenu}
        >
            <DropdownBotSelector
                bots={bots ?? []}
                activeBot={activeBot}
                setActiveBot={setActiveBot}
            />
            <Divider/>
            <DropdownMenuItemStyled
                onClick={summarizeNew}
            >
                <IconThreadSummarization/>
                <FormattedMessage defaultMessage='Summarize new messages'/>
            </DropdownMenuItemStyled>
            <DropdownMenuItemStyled
                onClick={actionItems}
            >
                <IconSparkleCheckmarkStyled/>
                <FormattedMessage defaultMessage='Find action items'/>
            </DropdownMenuItemStyled>
            <DropdownMenuItemStyled
                onClick={openQuestions}
            >
                <IconSparkleQuestionStyled/>
                <FormattedMessage defaultMessage='Find open questions'/>
            </DropdownMenuItemStyled>
            <Divider/>
            <DropdownInfoOnlyVisibleToYou/>
        </AskAIButton>
    );
};

export default UnreadsSumarize;

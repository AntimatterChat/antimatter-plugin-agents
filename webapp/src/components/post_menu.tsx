// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import {Post} from '@mattermost/types/posts';

import styled from 'styled-components';

import {useStore} from 'react-redux';

import {doReaction} from '../client';

import {AgentTaskName} from '@/agent_chat_client';
import {runAgentTask, useChatAgentBotlist} from '@/agent_chat_state';
import {useBotlist} from '@/bots';

import IconAI from './assets/icon_ai';
import IconReactForMe from './assets/icon_react_for_me';
import IconSparkleCheckmark from './assets/icon_sparkle_checkmark';
import IconSparkleQuestion from './assets/icon_sparkle_question';
import DotMenu, {DropdownMenu, DropdownMenuItem} from './dot_menu';
import IconThreadSummarization from './assets/icon_thread_summarization';
import {Divider, DropdownInfoOnlyVisibleToYou} from './dropdown_info';
import {DropdownBotSelector} from './bot_selector';

type Props = {
    post: Post,
    handleDropdownOpened?: (open: boolean) => void,
}

// The AI actions of a message (classic web app): the person's agent works on the message's thread, through the
// server (agent tasks), and the thread of its answer opens. "React for me" is the app's own, with its own bots.
const PostMenu = (props: Props) => {
    const store = useStore();
    const intl = useIntl();
    const {bots, activeBot, setActiveBot} = useChatAgentBotlist();
    const {bots: appBots} = useBotlist();
    const post = props.post;

    const analyzeThread = async (postId: string, task: AgentTaskName) => {
        try {
            await runAgentTask(store as any, {task, post_id: postId}, activeBot?.id);
        } catch (e) {
            console.error('Could not ask an agent', e); // eslint-disable-line no-console
        }
    };

    if (bots && bots.length === 0) {
        // No bots available (either unconfigured or filtered by permissions)
        return null;
    }

    return (
        <DotMenu
            icon={<IconAI/>}
            title={intl.formatMessage({defaultMessage: 'AI Actions'})}
            dropdownMenu={StyledDropdownMenu}
            testId='ai-actions-menu'
            onOpenChange={props.handleDropdownOpened}
        >
            <DropdownBotSelector
                bots={bots ?? []}
                activeBot={activeBot}
                setActiveBot={setActiveBot}
            />
            <Divider/>
            <DropdownMenuItem onClick={() => analyzeThread(post.id, 'summarize_thread')}>
                <span className='icon'><IconThreadSummarization/></span>
                <FormattedMessage defaultMessage='Summarise thread' description='AI actions on a message: the agent of the person summarises the thread, in the AI chat.'/>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => analyzeThread(post.id, 'find_action_items')}>
                <span className='icon'><IconSparkleCheckmarkStyled/></span>
                <FormattedMessage defaultMessage='Find action items'/>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => analyzeThread(post.id, 'find_open_questions')}>
                <span className='icon'><IconSparkleQuestionStyled/></span>
                <FormattedMessage defaultMessage='Find open questions'/>
            </DropdownMenuItem>
            {Boolean(appBots?.length) && (
                <DropdownMenuItem onClick={() => doReaction(post.id)}>
                    <span className='icon'><IconReactForMe/></span>
                    <FormattedMessage defaultMessage='React for me'/>
                </DropdownMenuItem>
            )}
            <Divider/>
            <DropdownInfoOnlyVisibleToYou/>
        </DotMenu>
    );
};

const IconSparkleCheckmarkStyled = styled(IconSparkleCheckmark)`
	color: rgba(var(--center-channel-color-rgb), 0.56);
`;

const IconSparkleQuestionStyled = styled(IconSparkleQuestion)`
	color: rgba(var(--center-channel-color-rgb), 0.56);
`;

const StyledDropdownMenu = styled(DropdownMenu)`
	min-width: 240px;
`;

export default PostMenu;

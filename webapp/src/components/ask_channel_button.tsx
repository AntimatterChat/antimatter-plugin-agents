// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useRef, useState, useEffect} from 'react';
import styled, {css} from 'styled-components';
import {useSelector, useStore} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';
//eslint-disable-next-line import/no-unresolved -- react-bootstrap is external
import {OverlayTrigger, Tooltip, Overlay} from 'react-bootstrap';
import {FormattedMessage, useIntl} from 'react-intl';

import {AgentTaskRequest} from '@/agent_chat_client';
import {runAgentTask, useChatAgentBotlist} from '@/agent_chat_state';

import IconAI from './assets/icon_ai';
import {ChannelSummarizePopover} from './channel_summarize_popover';

interface ButtonContainerProps {
    $isActive: boolean;
}

const ButtonContainer = styled.button<ButtonContainerProps>`
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border-radius: 4px;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: rgba(var(--center-channel-color-rgb), 0.56);
    transition: background 0.15s ease-in-out, color 0.15s ease-in-out;

    &:hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
        color: rgba(var(--center-channel-color-rgb), 0.72);
    }

    &:active {
        background: rgba(var(--center-channel-color-rgb), 0.16);
        color: rgba(var(--center-channel-color-rgb), 0.72);
    }

    ${({$isActive}) => $isActive && css`
        background: rgba(var(--button-bg-rgb), 0.08);
        color: var(--button-bg);

        &:hover {
            background: rgba(var(--button-bg-rgb), 0.12);
            color: var(--button-bg);
        }

        &:active {
            background: rgba(var(--button-bg-rgb), 0.16);
            color: var(--button-bg);
        }
    `}

    svg {
        width: 16px;
        height: 16px;
        display: block;
    }
`;

const PopoverWrapper = React.forwardRef((props: any, ref: any) => {
    const {
        style,
        className,
        positionTop,
        positionLeft,
        children,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        arrowOffsetLeft,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        arrowOffsetTop,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        placement,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        arrowRef,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        arrowStyle,
        ...rest
    } = props;

    return (
        <div
            ref={ref}
            className={className}
            style={{
                ...style,
                position: 'absolute',
                top: positionTop,
                left: positionLeft,
                zIndex: 1000,
                marginTop: '8px',
                marginLeft: '148px',
            }}
            {...rest}
        >
            {children}
        </div>
    );
});

const AskChannelButton = () => {
    const intl = useIntl();
    const store = useStore();
    const [showPopover, setShowPopover] = useState(false);
    const target = useRef<HTMLButtonElement>(null);
    const {bots, activeBot, setActiveBot} = useChatAgentBotlist();

    const currentChannelId = useSelector((state: GlobalState) => state.entities.channels.currentChannelId);
    const currentChannel = useSelector((state: GlobalState) => state.entities.channels.channels[currentChannelId]);
    const lastViewedAt = useSelector((state: GlobalState) => state.entities.channels.myMembers[currentChannelId]?.last_viewed_at || 0);
    const [initialLastViewedAt, setInitialLastViewedAt] = useState(lastViewedAt);

    useEffect(() => {
        setInitialLastViewedAt(lastViewedAt);
    }, [currentChannelId]);

    const channelName = currentChannel?.display_name || 'Current Channel';

    // The person's agent answers about the channel through the server (agent tasks); the AI chat opens on it.
    const handleSummarize = async (options: {analysis_type: string; prompt?: string; days?: number}) => {
        if (!activeBot) {
            return;
        }
        setShowPopover(false);

        let request: AgentTaskRequest;
        switch (options.analysis_type) {
        case 'custom':
            request = {task: 'ask_channel', channel_id: currentChannelId, question: options.prompt ?? ''};
            break;
        case 'days':
            request = {task: 'summarize_channel', channel_id: currentChannelId, since: Date.now() - ((options.days ?? 7) * 24 * 60 * 60 * 1000)};
            break;
        default:
            request = {task: 'summarize_channel', channel_id: currentChannelId, since: initialLastViewedAt};
        }
        try {
            await runAgentTask(store as any, request, activeBot.id);
        } catch (e) {
            console.error('Could not ask an agent', e); // eslint-disable-line no-console
        }
    };

    // Handle clicking outside to close
    useEffect(() => {
        const handleDocumentClick = (e: MouseEvent) => {
            if (target.current && !target.current.contains(e.target as Node)) {
                // Check if the click is inside the popover
                const popover = document.querySelector('.channel-summarize-popover');
                if (popover && popover.contains(e.target as Node)) {
                    return;
                }
                setShowPopover(false);
            }
        };

        if (showPopover) {
            document.addEventListener('mousedown', handleDocumentClick);
        }

        return () => {
            document.removeEventListener('mousedown', handleDocumentClick);
        };
    }, [showPopover]);

    const handleToggle = () => {
        setShowPopover(!showPopover);
    };

    const buttonLabel = intl.formatMessage({defaultMessage: 'Ask Agents about this channel'});
    const tooltip = (
        <Tooltip id='ask-agents-tooltip'>
            <FormattedMessage defaultMessage='Ask Agents about this channel'/>
        </Tooltip>
    );

    return (
        <>
            {showPopover ? (
                <ButtonContainer
                    ref={target}
                    onClick={handleToggle}
                    $isActive={showPopover}
                    aria-label={buttonLabel}
                    title={buttonLabel}
                    data-testid='ask-channel-button'
                >
                    <IconAI/>
                </ButtonContainer>
            ) : (
                <OverlayTrigger
                    placement='bottom'
                    overlay={tooltip}
                >
                    <ButtonContainer
                        ref={target}
                        onClick={handleToggle}
                        $isActive={showPopover}
                        aria-label={buttonLabel}
                        title={buttonLabel}
                        data-testid='ask-channel-button'
                    >
                        <IconAI/>
                    </ButtonContainer>
                </OverlayTrigger>
            )}
            <Overlay
                target={() => target.current}
                show={showPopover}
                placement='bottom'
                rootClose={true}
                onHide={() => setShowPopover(false)}
            >
                <PopoverWrapper className='channel-summarize-popover'>
                    <ChannelSummarizePopover
                        bots={bots || []}
                        activeBot={activeBot}
                        setActiveBot={setActiveBot}
                        channelName={channelName}
                        onSummarize={handleSummarize}
                        lastViewedAt={initialLastViewedAt}
                    />
                </PopoverWrapper>
            </Overlay>
        </>
    );
};

export default AskChannelButton;

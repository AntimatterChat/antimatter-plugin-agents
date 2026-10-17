// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

import {ChatAgent, agentImageURL} from '@/agent_chat_client';

import {CheckIcon, ChevronDownIcon} from './icons';
import {Avatar, t} from './styles';

// AgentActivity is Fusion's activity line of an agent (the dot and what it's doing, as in the member list), when
// Fusion runs: nothing while the agent is idle.
export function AgentActivity({agentId}: {agentId: string}) {
    const user = useSelector((state: any) => state.entities?.users?.profiles?.[agentId]);
    const FusionAgentActivity = (window as any).Components?.FusionAgentActivity;
    if (!FusionAgentActivity || !user) {
        return null;
    }
    return <FusionAgentActivity user={user}/>;
}

type Props = {
    agents: ChatAgent[];
    agent: ChatAgent;
    onSelect: (agent: ChatAgent) => void;
};

// AgentPicker shows the agent the panel talks to, with its live activity, and lets the person pick another of the
// agents they may use (only those the server lists).
export default function AgentPicker({agents, agent, onSelect}: Props) {
    const {formatMessage} = useIntl();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const name = agent.displayName || agent.username;
    const single = agents.length < 2;

    return (
        <Root ref={rootRef}>
            <Trigger
                type='button'
                aria-haspopup={single ? undefined : 'listbox'}
                aria-expanded={single ? undefined : open}
                aria-label={formatMessage({defaultMessage: 'Agent: {name}', description: 'Label of the AI chat side panel\'s agent picker, for screen readers. {name} is the agent the panel talks to.'}, {name})}
                disabled={single}
                onClick={() => setOpen(!open)}
                data-testid='ai-chat-agent-picker'
            >
                <Avatar
                    src={agentImageURL(agent.id)}
                    alt=''
                    $size={28}
                />
                <Names>
                    <Name>{name}</Name>
                    <AgentActivity agentId={agent.id}/>
                </Names>
                {!single && <ChevronDownIcon size={16}/>}
            </Trigger>
            {open && (
                <List
                    role='listbox'
                    aria-label={formatMessage({defaultMessage: 'Agents', description: 'Label of the list of agents in the AI chat side panel\'s agent picker, for screen readers.'})}
                >
                    {agents.map((a) => (
                        <Option
                            key={a.id}
                            role='option'
                            aria-selected={a.id === agent.id}
                            tabIndex={0}
                            onClick={() => {
                                setOpen(false);
                                onSelect(a);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setOpen(false);
                                    onSelect(a);
                                }
                            }}
                        >
                            <Avatar
                                src={agentImageURL(a.id)}
                                alt=''
                                $size={24}
                            />
                            <Names>
                                <Name>{a.displayName || a.username}</Name>
                                <Username>{'@' + a.username}</Username>
                            </Names>
                            {a.id === agent.id && <CheckIcon size={16}/>}
                        </Option>
                    ))}
                </List>
            )}
        </Root>
    );
}

const Root = styled.div`
    position: relative;
    min-width: 0;
    flex: 1;
`;

const Trigger = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    min-width: 0;
    padding: 4px 8px 4px 4px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: ${t.text};
    cursor: pointer;
    text-align: left;

    &:hover:not(:disabled), &[aria-expanded='true'] {
        background: ${t.hover};
    }

    &:disabled {
        cursor: default;
    }

    > svg {
        flex: none;
        color: ${t.muted};
    }
`;

const Names = styled.span`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    font-size: 12px;
    color: ${t.muted};

    > * {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Name = styled.span`
    font: 600 14px/18px ${t.fontDisplay};
    color: ${t.text};
`;

const Username = styled.span`
    font-size: 12px;
    color: ${t.muted};
`;

const List = styled.div`
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    left: 0;
    width: min(300px, calc(100vw - 24px));
    max-height: 320px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid ${t.line};
    border-radius: 12px;
    background: ${t.main};
    box-shadow: ${t.shadow};
`;

const Option = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
    color: ${t.text};

    &:hover, &:focus-visible {
        background: ${t.hover};
        outline: none;
    }

    &[aria-selected='true'] {
        background: ${t.accentSoft};
    }

    > svg {
        flex: none;
        color: ${t.accent};
    }
`;

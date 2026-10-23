// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import styled from 'styled-components';

import {
    AgentTool,
    AgentToolSource,
    PREFERENCE_CATEGORY_AI_TOOLS,
    PREFERENCE_NAME_AI_TOOL_CHOICES,
    ToolChoices,
    connectMCPServer,
    disconnectMCPServer,
    getAgentTools,
} from '@/agent_chat_client';
import {savePreferences} from '@/client';
import {onToolsChanged} from '@/tools_events';

import {ToolsIcon} from './icons';
import {IconButton, t} from './styles';

// The Tools menu of the AI chat (Antimatter): the tools the agent may use for the person, by source (Antimatter's
// own, each app's, each MCP server's), each of which they may turn off for themselves; and, for an MCP server where
// each person signs in, signing in and out. The server decides what's there: the agent's policy, and the person's
// own sign-ins only. Their choices are a preference the server reads (ai_tools), the same for every agent.

const CHOICES_KEY = `${PREFERENCE_CATEGORY_AI_TOOLS}--${PREFERENCE_NAME_AI_TOOL_CHOICES}`;

// parseChoices reads the person's choices; anything unreadable is none.
export function parseChoices(value: string | undefined): ToolChoices {
    if (!value) {
        return {off_sources: [], off_tools: []};
    }
    try {
        const parsed = JSON.parse(value);
        return {
            off_sources: Array.isArray(parsed?.off_sources) ? parsed.off_sources.filter((s: unknown) => typeof s === 'string') : [],
            off_tools: Array.isArray(parsed?.off_tools) ? parsed.off_tools.filter((s: unknown) => typeof s === 'string') : [],
        };
    } catch {
        return {off_sources: [], off_tools: []};
    }
}

// withChoice turns an item on (taken out of the list) or off (added once).
export function withChoice(list: string[], item: string, on: boolean): string[] {
    const rest = list.filter((x) => x !== item);
    return on ? rest : [...rest, item];
}

type Props = {
    agentId: string;
    agentName: string;
};

export default function ToolsMenu({agentId, agentName}: Props) {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const currentUserId = useSelector((state: any) => state.entities?.users?.currentUserId as string);
    const channelId = useSelector((state: any) => state.entities?.channels?.currentChannelId as string || '');
    const choicesValue = useSelector((state: any) => state.entities?.preferences?.myPreferences?.[CHOICES_KEY]?.value as string | undefined);
    const choices = parseChoices(choicesValue);
    const [open, setOpen] = useState(false);
    const [sources, setSources] = useState<AgentToolSource[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            setSources(await getAgentTools(agentId, channelId));
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [agentId, channelId]);

    useEffect(() => {
        setSources(null);
    }, [agentId]);

    useEffect(() => {
        if (open) {
            load();
        }
    }, [open, load]);

    // A sign-in finished in its own window, or an admin changed a server: the list again.
    useEffect(() => onToolsChanged(() => {
        if (open) {
            load();
        }
    }), [open, load]);

    // While open, a click elsewhere or Escape closes the menu.
    useEffect(() => {
        if (!open) {
            return () => { /* nothing to stop */ };
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

    const save = (next: ToolChoices) => {
        if (!currentUserId) {
            return;
        }
        const preference = {user_id: currentUserId, category: PREFERENCE_CATEGORY_AI_TOOLS, name: PREFERENCE_NAME_AI_TOOL_CHOICES, value: JSON.stringify(next)};
        const previous = {...preference, value: JSON.stringify(choices)};
        dispatch({type: 'RECEIVED_PREFERENCES', data: [preference]});
        savePreferences(currentUserId, [preference]).catch(() => {
            dispatch({type: 'RECEIVED_PREFERENCES', data: [previous]});
            setFailed(true);
        });
    };
    const setSource = (source: AgentToolSource, on: boolean) => save({...choices, off_sources: withChoice(choices.off_sources, source.key, on)});
    const setTool = (tool: AgentTool, on: boolean) => save({...choices, off_tools: withChoice(choices.off_tools, tool.name, on)});

    const signIn = async (source: AgentToolSource) => {
        setBusy(source.key);
        try {
            const {authorize_url: url} = await connectMCPServer(source.source_id);

            // Its own window, which can't reach this one; the server says when it's done.
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
            setFailed(true);
        } finally {
            setBusy('');
        }
    };
    const signOut = async (source: AgentToolSource) => {
        setBusy(source.key);
        try {
            await disconnectMCPServer(source.source_id);
            await load();
        } catch {
            setFailed(true);
        } finally {
            setBusy('');
        }
    };

    const label = formatMessage({defaultMessage: 'Tools', description: 'AI chat side panel: button that opens the menu of the tools the agent may use for the person (turn them off, sign in to services).'});

    return (
        <Root ref={rootRef}>
            <IconButton
                type='button'
                aria-haspopup='dialog'
                aria-expanded={open}
                aria-label={label}
                title={label}
                onClick={() => setOpen(!open)}
                data-testid='ai-chat-tools-button'
            >
                <ToolsIcon/>
            </IconButton>
            {open && (
                <Menu
                    role='dialog'
                    aria-label={formatMessage({defaultMessage: '{name}\'s tools', description: 'AI chat side panel: label of the Tools menu, for screen readers. {name} is the agent.'}, {name: agentName})}
                    data-testid='ai-chat-tools-menu'
                >
                    <Heading>{formatMessage({defaultMessage: 'Tools {name} may use for you', description: 'AI chat side panel: heading of the Tools menu. {name} is the agent; the tools always act with the person\'s own rights.'}, {name: agentName})}</Heading>
                    {failed && <Problem>{formatMessage({defaultMessage: 'Something didn\'t work. Try again.', description: 'AI chat side panel, Tools menu: error when the tools can\'t be read or a change can\'t be saved.'})}</Problem>}
                    {sources === null && !failed && <Note>{formatMessage({defaultMessage: 'Loading…', description: 'AI chat side panel, Tools menu: while the list of tools is read.'})}</Note>}
                    {sources?.length === 0 && <Note>{formatMessage({defaultMessage: 'This agent has no tools.', description: 'AI chat side panel, Tools menu: the agent may use no tool (its admins gave it none).'})}</Note>}
                    {sources?.map((source) => {
                        const needsSignIn = source.auth === 'oauth' && !source.connected;
                        const sourceOn = !choices.off_sources.includes(source.key);
                        return (
                            <Source key={source.key}>
                                <SourceRow>
                                    <Initial aria-hidden={true}>{source.name.charAt(0).toUpperCase()}</Initial>
                                    <SourceText>
                                        <b>{source.name}</b>
                                        <SourceNote>
                                            {needsSignIn && formatMessage({defaultMessage: 'Sign in to use it with your account', description: 'AI chat side panel, Tools menu: under a service (MCP server) the person hasn\'t signed in to; its tools would act with their own account there.'})}
                                            {source.auth === 'oauth' && source.connected && (
                                                <>
                                                    {formatMessage({defaultMessage: 'Signed in', description: 'AI chat side panel, Tools menu: under a service (MCP server) the person signed in to.'})}
                                                    {' · '}
                                                    <LinkButton
                                                        type='button'
                                                        disabled={busy === source.key}
                                                        onClick={() => signOut(source)}
                                                    >
                                                        {formatMessage({defaultMessage: 'Sign out', description: 'AI chat side panel, Tools menu: forgets the person\'s sign-in to a service (MCP server).'})}
                                                    </LinkButton>
                                                </>
                                            )}
                                            {source.auth === 'service_account' && formatMessage({defaultMessage: 'A shared account: its tools only read', description: 'AI chat side panel, Tools menu: under a service (MCP server) an admin set up with one shared account; only its tools that read are offered.'})}
                                            {source.unavailable && formatMessage({defaultMessage: 'Not answering right now', description: 'AI chat side panel, Tools menu: under a service (MCP server) whose tools couldn\'t be listed.'})}
                                        </SourceNote>
                                    </SourceText>
                                    {needsSignIn ? (
                                        <SignIn
                                            type='button'
                                            disabled={busy === source.key}
                                            onClick={() => signIn(source)}
                                        >
                                            {formatMessage({defaultMessage: 'Sign in', description: 'AI chat side panel, Tools menu: button that opens the sign-in of a service (MCP server) in a new window, so that its tools act with the person\'s own account.'})}
                                        </SignIn>
                                    ) : (
                                        <Switch
                                            on={sourceOn}
                                            label={formatMessage({defaultMessage: 'Use {name}', description: 'AI chat side panel, Tools menu: accessible label of the switch that turns a whole source of tools on or off for the person. {name} is the source (Antimatter, an app, a service).'}, {name: source.name})}
                                            onChange={(on) => setSource(source, on)}
                                        />
                                    )}
                                </SourceRow>
                                {sourceOn && source.tools.map((tool) => (
                                    <ToolRow key={tool.name}>
                                        <ToolText title={tool.description}>
                                            <span>{tool.title || tool.name}</span>
                                            {!tool.auto_run && <Tag>{formatMessage({defaultMessage: 'Asks you first', description: 'AI chat side panel, Tools menu: tag on a tool the agent can only run once the person confirms each call.'})}</Tag>}
                                        </ToolText>
                                        <Switch
                                            small={true}
                                            on={!choices.off_tools.includes(tool.name)}
                                            label={formatMessage({defaultMessage: 'Use {name}', description: 'AI chat side panel, Tools menu: accessible label of the switch that turns one tool on or off for the person. {name} is the tool.'}, {name: tool.title || tool.name})}
                                            onChange={(on) => setTool(tool, on)}
                                        />
                                    </ToolRow>
                                ))}
                            </Source>
                        );
                    })}
                </Menu>
            )}
        </Root>
    );
}

function Switch({on, label, small, onChange}: {on: boolean; label: string; small?: boolean; onChange: (on: boolean) => void}) {
    return (
        <SwitchButton
            type='button'
            role='switch'
            aria-checked={on}
            aria-label={label}
            $small={Boolean(small)}
            onClick={() => onChange(!on)}
        >
            <span/>
        </SwitchButton>
    );
}

const Root = styled.div`
    position: relative;
    flex: none;
`;

const Menu = styled.div`
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    right: 0;
    width: min(320px, calc(100vw - 24px));
    max-height: min(480px, calc(100vh - 120px));
    overflow-y: auto;
    padding: 6px;
    border: 1px solid ${t.line};
    border-radius: 12px;
    background: ${t.main};
    box-shadow: ${t.shadow};
    color: ${t.text};
`;

const Heading = styled.div`
    padding: 6px 8px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${t.faint};
`;

const Note = styled.div`
    padding: 10px 8px;
    font-size: 13px;
    color: ${t.muted};
`;

const Problem = styled(Note)`
    color: ${t.danger};
`;

const Source = styled.div`
    padding: 4px 0;

    & + & {
        border-top: 1px solid ${t.line};
    }
`;

const SourceRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    min-width: 0;
`;

const Initial = styled.span`
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: ${t.raise2};
    color: ${t.text2};
    font: 600 12px/1 ${t.fontUI};
`;

const SourceText = styled.span`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;

    > b {
        font: 600 14px/18px ${t.fontDisplay};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const SourceNote = styled.span`
    font-size: 12px;
    line-height: 16px;
    color: ${t.muted};
`;

const LinkButton = styled.button`
    padding: 0;
    border: 0;
    background: none;
    color: ${t.muted};
    font: inherit;
    text-decoration: underline;
    cursor: pointer;

    &:hover:not(:disabled) {
        color: ${t.danger};
    }
`;

const SignIn = styled.button`
    flex: none;
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: ${t.accent};
    color: #FFFFFF;
    font: 600 12.5px/1 ${t.fontUI};
    cursor: pointer;

    &:hover:not(:disabled) {
        filter: brightness(1.08);
    }

    &:disabled {
        opacity: 0.6;
        cursor: default;
    }
`;

const ToolRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px 4px 46px;
    min-width: 0;
`;

const ToolText = styled.span`
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: ${t.text2};

    > span:first-child {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Tag = styled.span`
    flex: none;
    padding: 1px 6px;
    border-radius: 999px;
    background: ${t.raise2};
    color: ${t.muted};
    font-size: 11px;
    font-weight: 600;
`;

const SwitchButton = styled.button<{$small: boolean}>`
    position: relative;
    flex: none;
    width: ${(p) => (p.$small ? 28 : 34)}px;
    height: ${(p) => (p.$small ? 16 : 20)}px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: ${t.raise2};
    cursor: pointer;
    transition: background .12s ease;

    > span {
        position: absolute;
        top: 2px;
        left: 2px;
        width: ${(p) => (p.$small ? 12 : 16)}px;
        height: ${(p) => (p.$small ? 12 : 16)}px;
        border-radius: 50%;
        background: #FFFFFF;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.24);
        transition: transform .12s ease;
    }

    &[aria-checked='true'] {
        background: ${t.accent};
    }

    &[aria-checked='true'] > span {
        transform: translateX(${(p) => (p.$small ? 12 : 14)}px);
    }

    &:focus-visible {
        outline: 2px solid ${t.accent};
        outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
        transition: none;

        > span {
            transition: none;
        }
    }
`;

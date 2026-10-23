// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';

import {isFusionUI} from '@/am_webapp';

import {SparkleIcon} from './icons';
import {Badge, Center, PrimaryButton, Text, Title} from './styles';

// Who sets up agents: system admins (server-wide agents, in the System Console's AI settings) and community admins
// (their community's, in its settings' AI tab).
type SetUp = 'server' | 'community' | '';

function whoSetsUpAgents(state: any): SetUp {
    const me = state.entities?.users?.profiles?.[state.entities?.users?.currentUserId];
    const roles = (me?.roles || '').split(' ');
    if (roles.includes('system_admin')) {
        return 'server';
    }
    const teamId = state.entities?.teams?.currentTeamId;
    const member = state.entities?.teams?.myMembers?.[teamId];
    return Boolean(member?.scheme_admin) || (member?.roles || '').split(' ').includes('team_admin') ? 'community' : '';
}

// NoAgents fills the panel when the person has no agent they may use: the people who can set one up are sent to where
// agents are made (Fusion's /<team>/integrations/agents opens the System Console's AI settings for a system admin and
// the community's settings for its admins), the others are told to ask an admin. No artwork, Fusion's empty state.
export default function NoAgents() {
    const setUp = useSelector(whoSetsUpAgents);
    const teamName = useSelector((state: any) => state.entities?.teams?.teams?.[state.entities?.teams?.currentTeamId]?.name || '');
    const fusion = isFusionUI();

    return (
        <Center data-testid='ai-chat-no-agents'>
            <Badge><SparkleIcon size={24}/></Badge>
            <Title>
                <FormattedMessage
                    defaultMessage='No agents yet'
                    description='AI chat side panel: title when the person has no agent they may talk to.'
                />
            </Title>
            <Text>
                {setUp === 'server' && (
                    <FormattedMessage
                        defaultMessage='Agents are AI assistants you talk to like coworkers. Set one up in the System Console, under AI.'
                        description='AI chat side panel, no agents yet, for a system admin (who makes the server’s agents in the System Console’s AI settings).'
                    />
                )}
                {setUp === 'community' && (
                    <FormattedMessage
                        defaultMessage='Agents are AI assistants you talk to like coworkers. Set one up in the community’s settings, under AI.'
                        description='AI chat side panel, no agents yet, for a community admin (who makes the community’s agents in its settings’ AI tab).'
                    />
                )}
                {!setUp && (
                    <FormattedMessage
                        defaultMessage='Agents are AI assistants you talk to like coworkers. Ask an admin to set one up for you.'
                        description='AI chat side panel, no agents yet, for someone who can’t make one.'
                    />
                )}
            </Text>
            {setUp && fusion && teamName && (
                <PrimaryButton
                    type='button'
                    onClick={() => window.WebappUtils?.browserHistory?.push(`/${teamName}/integrations/agents`)}
                >
                    <FormattedMessage
                        defaultMessage='Set up an agent'
                        description='AI chat side panel, no agents yet: opens where agents are made (the System Console’s AI settings for a system admin, the community’s settings for its admins).'
                    />
                </PrimaryButton>
            )}
        </Center>
    );
}

// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';

import {isFusionUI} from '@/am_webapp';

import {SparkleIcon} from './icons';
import {Badge, Center, PrimaryButton, Text, Title} from './styles';

// Who sets up agents: system admins (server-wide agents) and community admins (their community's).
function canSetUpAgents(state: any): boolean {
    const me = state.entities?.users?.profiles?.[state.entities?.users?.currentUserId];
    const roles = (me?.roles || '').split(' ');
    if (roles.includes('system_admin')) {
        return true;
    }
    const teamId = state.entities?.teams?.currentTeamId;
    const member = state.entities?.teams?.myMembers?.[teamId];
    return Boolean(member?.scheme_admin) || (member?.roles || '').split(' ').includes('team_admin');
}

// NoAgents fills the panel when the person has no agent they may use: the people who can set one up are sent to
// Integrations › Agents (Fusion's), the others are told to ask an admin. No artwork, Fusion's empty state.
export default function NoAgents() {
    const canSetUp = useSelector(canSetUpAgents);
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
                {canSetUp ? (
                    <FormattedMessage
                        defaultMessage='Agents are AI assistants you talk to like coworkers. Set one up in Integrations › Agents.'
                        description='AI chat side panel, no agents yet, for someone who can make one (an admin).'
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage='Agents are AI assistants you talk to like coworkers. Ask an admin to set one up for you.'
                        description='AI chat side panel, no agents yet, for someone who can’t make one.'
                    />
                )}
            </Text>
            {canSetUp && fusion && teamName && (
                <PrimaryButton
                    type='button'
                    onClick={() => window.WebappUtils?.browserHistory?.push(`/${teamName}/integrations/agents`)}
                >
                    <FormattedMessage
                        defaultMessage='Set up an agent'
                        description='AI chat side panel, no agents yet: opens Integrations › Agents.'
                    />
                </PrimaryButton>
            )}
        </Center>
    );
}

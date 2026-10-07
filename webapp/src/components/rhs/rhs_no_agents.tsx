// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

import {GlobalState} from '@mattermost/types/store';

import {PrimaryButton} from '@/components/assets/buttons';
import IconAI from '@/components/assets/icon_ai';
import manifest from '@/manifest';
import {userHasSystemPermission} from '@/utils/permissions';

// The Agents page (AGENTS_ROUTE of agents_page.tsx, which would bring the whole page along).
const AGENTS_ROUTE = `/plug/${manifest.id}/agents`;

// RHSNoAgents fills the Agents panel when there's no agent to chat with yet: people who can create one are sent to
// the Agents page, the others are told to ask an admin.
export default function RHSNoAgents() {
    const currentUserId = useSelector<GlobalState, string>((state) => state.entities.users.currentUserId);
    const canCreate = useSelector((state: GlobalState) =>
        userHasSystemPermission(state, currentUserId, 'manage_own_agent') || userHasSystemPermission(state, currentUserId, 'manage_system'));

    return (
        <Empty data-testid='rhs-no-agents'>
            <Badge>
                <IconAI size={28}/>
            </Badge>
            <Title>
                <FormattedMessage defaultMessage='No agents yet'/>
            </Title>
            <Text>
                {canCreate ? (
                    <FormattedMessage defaultMessage='Agents are AI assistants you can chat with here. Create one to get started.'/>
                ) : (
                    <FormattedMessage defaultMessage='Agents are AI assistants you can chat with here. Ask your system admin to set one up.'/>
                )}
            </Text>
            {canCreate && (
                <PrimaryButton onClick={() => window.WebappUtils?.browserHistory?.push(AGENTS_ROUTE)}>
                    <FormattedMessage defaultMessage='Create an agent'/>
                </PrimaryButton>
            )}
        </Empty>
    );
}

const Empty = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 28px;
    text-align: center;
`;

const Badge = styled.div`
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    margin-bottom: 6px;
    border-radius: 16px;
    background: rgba(var(--button-bg-rgb), 0.12);
    color: var(--button-bg);
`;

const Title = styled.div`
    font-size: 16px;
    font-weight: 600;
    color: var(--center-channel-color);
`;

const Text = styled.div`
    max-width: 280px;
    margin-bottom: 8px;
    font-size: 14px;
    line-height: 20px;
    color: rgba(var(--center-channel-color-rgb), 0.72);
`;

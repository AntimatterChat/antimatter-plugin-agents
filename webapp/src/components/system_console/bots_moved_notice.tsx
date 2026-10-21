// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled from 'styled-components';
import {FormattedMessage} from 'react-intl';

const Notice = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(63, 67, 80, 0.04);
    border-radius: 4px;
    border: 1px solid rgba(63, 67, 80, 0.12);
`;

const Title = styled.div`
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
`;

const Body = styled.div`
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    color: rgba(63, 67, 80, 0.72);
`;

// Agents are the server's now, managed in Integrations › Agents (this path opens it in a community).
const agentsPath = '/_redirect/integrations/agents';

const BotsMovedNotice = () => {
    return (
        <Notice>
            <Title>
                <FormattedMessage
                    defaultMessage='Agents have moved'
                    description='System Console, AI chat settings: notice title. Agents are managed by the server now.'
                />
            </Title>
            <Body>
                <FormattedMessage
                    defaultMessage='Agents are made and managed in <link>Integrations › Agents</link>, where their connection, instructions and who may use them are set.'
                    description='System Console, AI chat settings: notice body. <link> opens Integrations › Agents.'
                    values={{
                        link: (chunks: React.ReactNode) => (
                            <a href={agentsPath}>{chunks}</a>
                        ),
                    }}
                />
            </Body>
            <div>
                <a href={agentsPath}>
                    <FormattedMessage
                        defaultMessage='Open Integrations › Agents'
                        description='System Console, AI chat settings: link to the agents of the server.'
                    />
                </a>
            </div>
        </Notice>
    );
};

export default BotsMovedNotice;

// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ClientError} from '@mattermost/client';
import {Channel, ChannelMembership} from '@mattermost/types/channels';
import {Options} from '@mattermost/types/client4';
import {Post} from '@mattermost/types/posts';
import {UserProfile} from '@mattermost/types/users';

import {Client4} from './client';

// The AI chat talks to the server's agents (Antimatter): the agents a person may use, their conversations with them,
// and the tasks (summaries...) agents do for them. The server checks every call: the agents listed are the person's
// to use, a conversation or task for another agent, or on something they can't read, is refused.

export type ChatAgent = {
    id: string;
    displayName: string;
    username: string;
    is_default?: boolean;
};

export type AgentConversation = {
    root_id: string;
    channel_id: string;
    agent_id: string;
    title: string;
    direct: boolean;
    reply_count: number;
    create_at: number;
    last_reply_at: number;
};

export type AgentTaskName =
    | 'summarize_thread'
    | 'find_action_items'
    | 'find_open_questions'
    | 'summarize_channel'
    | 'ask_channel'
    | 'summarize_transcription';

export type AgentTaskRequest = {
    task: AgentTaskName;
    post_id?: string;
    channel_id?: string;
    since?: number;
    question?: string;
};

function apiURL(path: string): string {
    return `${Client4.url}/api/v4${path}`;
}

async function call<T>(path: string, options: Options = {}): Promise<T> {
    const url = apiURL(path);
    const response = await fetch(url, Client4.getOptions(options));
    if (!response.ok) {
        let message = '';
        try {
            const body = await response.json();
            message = typeof body?.message === 'string' ? body.message : '';
        } catch {
            // No JSON: the status says it.
        }
        throw new ClientError(Client4.url, {message, status_code: response.status, url});
    }
    return response.json();
}

// getChatAgents lists the built-in agents the person may talk to (the server's /api/v4/agents).
export function getChatAgents(): Promise<ChatAgent[]> {
    return call<ChatAgent[]>('/agents');
}

// getAgentConversations lists the person's conversations with agents (one agent's with agentId), the most recent
// first; "before" pages back.
export function getAgentConversations(agentId = '', before = 0, perPage = 50): Promise<AgentConversation[]> {
    const query = new URLSearchParams();
    if (agentId) {
        query.set('agent_id', agentId);
    }
    if (before > 0) {
        query.set('before', String(before));
    }
    query.set('per_page', String(perPage));
    return call<AgentConversation[]>(`/ai/agents/conversations?${query.toString()}`);
}

// startAgentTask asks an agent for a task: the server posts the person's request in their direct message with the
// agent, which answers it there. It gives that message (the conversation's first).
export function startAgentTask(agentId: string, request: AgentTaskRequest): Promise<Post> {
    return call<Post>(`/ai/agents/${encodeURIComponent(agentId)}/tasks`, {
        method: 'POST',
        body: JSON.stringify(request),
    });
}

// getAgentDirectChannel gives the person's direct message with an agent, made if needed, and their membership.
export async function getAgentDirectChannel(userId: string, agentId: string): Promise<{channel: Channel; member: ChannelMembership}> {
    const channel = await Client4.createDirectChannel([userId, agentId]);
    const member = await Client4.getMyChannelMember(channel.id);
    return {channel, member};
}

export function getAgentProfiles(ids: string[]): Promise<UserProfile[]> {
    return Client4.getProfilesByIds(ids);
}

export function agentImageURL(agentId: string): string {
    return Client4.getProfilePictureUrl(agentId, 0);
}

// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {Dispatch} from 'redux';

// An agent's answer streams into its post (the server's agent_post_stream event: the whole text so far, then "end",
// "error" or "cancel"), and is saved once at the end. Fusion shows it as it grows; in the classic web app the AI chat
// does, by updating the post it already has. A post it doesn't have, or that another account wrote, stays as it is.

export const AGENT_POST_STREAM_EVENT = 'agent_post_stream';

export type AgentPostStreamData = {
    post_id: string;
    channel_id?: string;
    root_id?: string;
    user_id?: string;
    message?: string;
    control?: 'start' | 'text' | 'end' | 'error' | 'cancel';
};

type Post = {id: string; user_id: string; message: string; props?: Record<string, unknown>};

export function streamedPost(post: Post | undefined, data: AgentPostStreamData): Post | undefined {
    if (!post || (data.user_id && post.user_id !== data.user_id)) {
        return undefined;
    }
    const done = data.control === 'end' || data.control === 'error' || data.control === 'cancel';
    const props = {...(post.props || {})};
    if (done) {
        delete props.agent_streaming;
    } else {
        props.agent_streaming = true;
    }
    const message = typeof data.message === 'string' ? data.message : post.message;
    if (message === post.message && Boolean(post.props?.agent_streaming) === !done) {
        return undefined;
    }

    // The text arriving isn't an edit: edit_at stays as it was.
    return {...post, message, props};
}

export function makeAgentPostStreamHandler(store: {dispatch: Dispatch; getState: () => any}) {
    return (msg: {data: AgentPostStreamData}) => {
        const data = msg?.data;
        if (!data?.post_id) {
            return;
        }
        const post = store.getState().entities?.posts?.posts?.[data.post_id];
        const next = streamedPost(post, data);
        if (next) {
            store.dispatch({type: 'RECEIVED_POST', data: next});
        }
    };
}

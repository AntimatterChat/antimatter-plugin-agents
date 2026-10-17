// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {makeAgentPostStreamHandler, streamedPost} from './agent_stream';

// In the classic web app the AI chat shows an agent's answer as it streams (agent_post_stream), as Fusion does.
describe('agent_post_stream', () => {
    const post = {id: 'reply', user_id: 'coder', message: '', edit_at: 0, props: {agent_streaming: true}};
    const data = (patch: Record<string, unknown>) => ({post_id: 'reply', user_id: 'coder', message: '', control: 'text' as const, ...patch});

    test('the text so far shows, marked as being written, never as an edit', () => {
        const next = streamedPost(post, data({message: 'The export lives'})) as any;
        expect(next.message).toBe('The export lives');
        expect(next.props.agent_streaming).toBe(true);
        expect(next.edit_at).toBe(0);
    });

    test('the end, an error or a cancel ends it', () => {
        expect((streamedPost(post, data({message: 'Done.', control: 'end'})) as any).props.agent_streaming).toBeUndefined();
        expect((streamedPost(post, data({message: 'Partial', control: 'error'})) as any).props.agent_streaming).toBeUndefined();
        expect((streamedPost(post, data({message: 'Partial', control: 'cancel'})) as any).props.agent_streaming).toBeUndefined();
    });

    test('nothing for a post not loaded, another account\'s, or no change', () => {
        expect(streamedPost(undefined, data({message: 'x'}))).toBeUndefined();
        expect(streamedPost({...post, user_id: 'maya'}, data({message: 'Spoofed'}))).toBeUndefined();
        expect(streamedPost({...post, message: 'Same'}, data({message: 'Same'}))).toBeUndefined();
    });

    test('the handler updates the post it has, and only that', () => {
        const dispatch = jest.fn();
        const state = {entities: {posts: {posts: {reply: post}}}};
        const handler = makeAgentPostStreamHandler({dispatch, getState: () => state});

        handler({data: data({message: 'Hello'})});
        expect(dispatch).toHaveBeenCalledWith({type: 'RECEIVED_POST', data: expect.objectContaining({id: 'reply', message: 'Hello'})});

        dispatch.mockClear();
        handler({data: data({post_id: 'unknown', message: 'Hello'})});
        handler({data: {} as any});
        expect(dispatch).not.toHaveBeenCalled();
    });
});

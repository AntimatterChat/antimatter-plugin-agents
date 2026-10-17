// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Dispatch} from 'redux';

import {runAgentTask} from './agent_chat_state';

// The Calls app's "Create meeting summary" button on a call's transcription (it calls the handler the AI chat keeps
// in its state): the person's agent summarises the transcription in their conversation with it, through the server,
// which reads the transcription only if they can.
export function makeCallsPostButtonClickedHandler(store: {dispatch: Dispatch; getState: () => any}) {
    return async (post: {id: string}) => {
        try {
            await runAgentTask(store, {task: 'summarize_transcription', post_id: post.id});
        } catch (e) {
            console.error('Could not ask an agent for the meeting summary', e); // eslint-disable-line no-console
        }
    };
}

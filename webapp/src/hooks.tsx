// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDispatch} from 'react-redux';

import {selectPost, openRHS, selectRegularPost} from 'src/redux_actions';

import {viewMyChannel} from 'src/client';

import {usesFusionConversation} from './agent_chat_state';

const selectPostLegacy = (postid: string, channelid: string) => {
    return {
        type: 'SELECT_POST',
        postId: postid,
        channelId: channelid,
        timestamp: Date.now(),
    };
};

export const doSelectPost = (postId: string, channelId: string, dispatch: any) => {
    // In Fusion the AI chat's side panel shows the conversation; the classic web app opens it as a thread in its own
    // side panel (the AI chat's panel there has no conversation view).
    if (usesFusionConversation()) {
        dispatch(selectPost(postId));
        dispatch(openRHS());
    } else {
        dispatch(selectPostLegacy(postId, channelId));
    }
    viewMyChannel(channelId);
};

export const useSelectPost = () => {
    const dispatch = useDispatch();

    return (postid: string, channelid: string) => {
        doSelectPost(postid, channelid, dispatch);
    };
};

export const doSelectNotAIPost = (postid: string, channelid: string, dispatch: any) => {
    dispatch(selectRegularPost(postid, channelid));
    viewMyChannel(channelid);
};

export const useSelectNotAIPost = () => {
    const dispatch = useDispatch();

    return (postid: string, channelid: string) => {
        doSelectNotAIPost(postid, channelid, dispatch);
    };
};

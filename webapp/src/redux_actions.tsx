// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// selectPost shows a conversation in the AI chat's side panel ('' for none); agentId is the agent it's with, when
// known: the panel shows that agent while the conversation is open, without changing the one the person picked.
export const selectPost = (postid: string, agentId = '') => {
    return {
        type: 'SELECT_AI_POST',
        postId: postid,
        agentId: postid ? agentId : '',
    };
};

let openRHSAction: any = null;

export const openRHS = () => {
    if (openRHSAction) {
        return openRHSAction;
    }
    return {
        type: 'NONE',
    };
};

export const setOpenRHSAction = (action: any) => {
    openRHSAction = action;
};

export const selectRegularPost = (postid: string, channelid: string) => {
    return {
        type: 'SELECT_POST',
        postId: postid,
        channelId: channelid,
    };
};

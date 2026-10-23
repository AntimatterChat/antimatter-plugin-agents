// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// The server says (ai_tools_changed) when the tools a person may use changed: they signed in to or out of an MCP
// server (in another window, too), or an admin changed one. The open Tools menu reads its list again.

type Listener = () => void;

const listeners = new Set<Listener>();

export function onToolsChanged(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function notifyToolsChanged() {
    listeners.forEach((listener) => listener());
}

export const AI_TOOLS_CHANGED_EVENT = 'ai_tools_changed';

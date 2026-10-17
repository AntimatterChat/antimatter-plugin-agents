// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Store, UnknownAction} from 'redux';
import {FormattedMessage, IntlShape, createIntl} from 'react-intl';

import {GlobalState} from '@mattermost/types/store';
import {CodeTagsIcon} from '@mattermost/compass-icons/components';

import manifest from '@/manifest';
import {PluginWebSocketMessage} from '@/types';

import {LLMBotPost} from './components/llmbot_post/llmbot_post';
import PostMenu from './components/post_menu';
import IconThreadSummarization from './components/assets/icon_thread_summarization';
import IconReactForMe from './components/assets/icon_react_for_me';
import AgentChatPanel, {PanelTitle} from './components/agent_chat/agent_chat_panel';
import {SparkleIcon} from './components/agent_chat/icons';
import CustomPromptsDropdown from './components/custom_prompts/custom_prompts_dropdown';
import CustomPromptsManagement from './components/custom_prompts/custom_prompts_management';
import Config from './components/system_console/config';
import {setSiteURL, doReaction, doRunSearch} from './client';

import {setOpenRHSAction} from './redux_actions';
import PostEventListener from './websocket';
import {setupRedux} from './redux';
import UnreadsSummarize from './components/unreads_summarize';
import {PostbackPost} from './components/postback_post';
import {AgentMentionReminderPost} from './components/agent_mention_reminder_post';
import {isFusionUI} from './am_webapp';
import SearchButton from './components/search_button';
import AskChannelButton from './components/ask_channel_button';
import {doSelectPost} from './hooks';
import {invalidateConversation} from './hooks/use_conversation';

// Side-effect import: registers a listener so invalidateConversation also
// clears the matching composition cache.
import '@/hooks/use_conversation_context';
import {notifyMCPConnectionUpdated, MCPConnectionEvent} from './hooks/use_mcp_connection_events';
import {handleAskChannelCommand, handleSummarizeChannelCommand} from './commands';
import SearchHints from './components/search_hints';
import {resolveActiveBot, getSelectedAgentId, fetchAndStoreBots} from './bots';
import {botsFromState, makeChannelAutoReplySchema} from './components/channel_settings/autoreply_schema';
import {handleChannelAutoReplyUpdated, ChannelAutoReplyUpdatedEvent} from './components/channel_settings/autoreply_state';
import {shouldSuppressBotNotification} from './notifications';
import {chatAgentsFromState, fetchChatAgents, runAgentTask, useChatAgents} from './agent_chat_state';
import {AgentTaskName} from './agent_chat_client';
import {AGENT_POST_STREAM_EVENT, makeAgentPostStreamHandler} from './agent_stream';

type WebappStore = Store<GlobalState, UnknownAction>

// Static intl for plain-string labels computed outside React (product label,
// channel-settings schema). Locale is resolved once at call time; a locale
// switch without reload keeps old labels, matching the product-label precedent.
function getStaticIntl(store: WebappStore): IntlShape {
    const state = store.getState() as any;
    const locale = state.entities?.i18n?.locale ?? 'en';
    let messages: Record<string, string>;
    try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        messages = require(`./i18n/${locale}.json`);
    } catch {
        // eslint-disable-next-line global-require
        messages = require('./i18n/en.json');
    }
    return createIntl({
        locale,
        messages,
        defaultLocale: 'en',
    });
}

function getAppLabel(store: WebappStore): string {
    return getStaticIntl(store).formatMessage({defaultMessage: 'AI chat', description: 'The AI chat app\'s name, on its button in the channel header (classic web app).'});
}

// The channel header's button (the classic web app's; Fusion has the app rail) shows while an agent is there to talk to.
const ChannelHeaderIcon = () => {
    const {agents} = useChatAgents();
    if (!agents || agents.length === 0) {
        return null;
    }
    return <SparkleIcon size={18}/>;
};

export default class Plugin {
    postEventListener: PostEventListener = new PostEventListener();
    private store: WebappStore | null = null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    public async initialize(registry: any, store: WebappStore) {
        setupRedux(registry, store);
        this.store = store;

        setSiteURL(window.location.origin + (window.basename || ''));

        registry.registerDesktopNotificationHook(this.blockFastBotNotifications.bind(this));

        registry.registerTranslations((locale: string) => {
            try {
                // eslint-disable-next-line global-require
                return require(`./i18n/${locale}.json`);
            } catch (e) {
                return {};
            }
        });

        // The AI chat is its side panel (no page of its own): the conversations with the server's agents.
        const rhs = registry.registerRightHandSidebarComponent(AgentChatPanel, PanelTitle);
        setOpenRHSAction(rhs.showRHSPlugin);

        // The server's agents the person may use, for the panel and the AI actions.
        fetchChatAgents(store.dispatch);

        // Handle all post-related websocket events with one handler
        registry.registerWebSocketEventHandler('custom_mattermost-ai_postupdate', this.postEventListener.handlePostUpdateWebsockets);
        registry.registerWebSocketEventHandler('custom_mattermost-ai_tool_call_status_updated', this.postEventListener.handlePostUpdateWebsockets);

        // Invalidate conversation cache when backend publishes conversation updates
        registry.registerWebSocketEventHandler(
            'custom_mattermost-ai_conversation_updated',
            (msg: PluginWebSocketMessage<{conversation_id: string}>) => {
                invalidateConversation(msg.data.conversation_id);
            },
        );

        // MCP OAuth connect/disconnect: refresh cached tool lists in open UI.
        registry.registerWebSocketEventHandler(
            'custom_mattermost-ai_mcp_connection_updated',
            (msg: PluginWebSocketMessage<MCPConnectionEvent>) => {
                notifyMCPConnectionUpdated(msg.data);
            },
        );

        // An agent's answer as it streams: Fusion shows it itself; the classic web app through the AI chat.
        if (!isFusionUI()) {
            registry.registerWebSocketEventHandler(AGENT_POST_STREAM_EVENT, makeAgentPostStreamHandler(store));
        }

        const LLMBotPostWithWebsockets = (props: any) => {
            return (
                <LLMBotPost
                    {...props}
                    websocketRegister={this.postEventListener.registerPostUpdateListener}
                    websocketUnregister={this.postEventListener.unregisterPostUpdateListener}
                />
            );
        };

        // Refetch in place rather than clearing first: the previous list stays
        // readable until fresh data replaces it. A null window would be visible
        // to the channel-settings tab's synchronous shouldRender, making the
        // "Agents" tab disappear and reappear on every config change. A failed
        // refetch leaves the stale list, which is preferable to no list.
        const refreshRuntimeBotsCache = () => {
            fetchAndStoreBots(store.dispatch).catch(() => { /* best effort */ });
            fetchChatAgents(store.dispatch);
        };

        registry.registerWebSocketEventHandler('config_changed', refreshRuntimeBotsCache);
        registry.registerWebSocketEventHandler('custom_mattermost-ai_bots_invalidate', refreshRuntimeBotsCache);

        // The app's own posts (its search answers, older conversations) and its notices.
        registry.registerPostTypeComponent('custom_llmbot', LLMBotPostWithWebsockets);
        registry.registerPostTypeComponent('custom_llm_postback', PostbackPost);
        registry.registerPostTypeComponent('custom_agent_mention_reminder', AgentMentionReminderPost);

        // The AI actions on a message: the person's agent works on its thread, through the server, and the panel opens
        // on the conversation. "React for me" is still the app's.
        const haveAgents = () => (chatAgentsFromState(store.getState())?.length ?? 1) > 0;
        const threadTask = (task: AgentTaskName) => async (postId: string) => {
            try {
                await runAgentTask(store, {task, post_id: postId});
            } catch (e) {
                console.error('Could not ask an agent', e); // eslint-disable-line no-console
            }
        };
        if (isFusionUI() && registry.registerPostDropdownSubMenuAction) {
            // Fusion keeps the AI actions out of a message's hover toolbar: they're a submenu of its ⋯ menu,
            // near the bottom. Hidden while no agent is available.
            const intl = getStaticIntl(store);
            const {rootRegisterMenuItem} = registry.registerPostDropdownSubMenuAction(
                intl.formatMessage({defaultMessage: 'AI actions', description: 'Submenu of a message\'s ⋯ menu with what an agent can do with the message\'s thread.'}), () => {}, haveAgents,
            );
            rootRegisterMenuItem(intl.formatMessage({defaultMessage: 'Summarise thread', description: 'AI actions on a message: the agent of the person summarises the thread, in the AI chat.'}), threadTask('summarize_thread'), haveAgents);
            rootRegisterMenuItem(intl.formatMessage({defaultMessage: 'Find action items', description: 'AI actions on a message: the person\'s agent lists the thread\'s action items, in the AI chat.'}), threadTask('find_action_items'), haveAgents);
            rootRegisterMenuItem(intl.formatMessage({defaultMessage: 'Find open questions', description: 'AI actions on a message: the person\'s agent lists the thread\'s unanswered questions, in the AI chat.'}), threadTask('find_open_questions'), haveAgents);
            rootRegisterMenuItem(intl.formatMessage({defaultMessage: 'React for me'}), doReaction, haveAgents);
        } else if (registry.registerPostActionComponent) {
            registry.registerPostActionComponent(PostMenu);
        } else {
            registry.registerPostDropdownMenuAction(<><span className='icon'><IconThreadSummarization/></span><FormattedMessage defaultMessage='Summarise thread' description='AI actions on a message: the agent of the person summarises the thread, in the AI chat.'/></>, threadTask('summarize_thread'));
            registry.registerPostDropdownMenuAction(<><span className='icon'><IconReactForMe/></span><FormattedMessage defaultMessage='React for me'/></>, doReaction);
        }

        registry.registerAdminConsoleCustomSetting('Config', Config);
        const appLabel = getAppLabel(store);

        // Channel settings tab (Antimatter >= 11.10 only). The schema is built
        // exactly once: the host re-runs hydration whenever the schema object
        // reference changes, so it must stay stable for the plugin's lifetime.
        if (registry.registerChannelSettingsTab) {
            registry.registerChannelSettingsTab(makeChannelAutoReplySchema(store, getStaticIntl(store)));

            // Re-sync an open settings modal when the setting changes remotely.
            registry.registerWebSocketEventHandler(
                'custom_mattermost-ai_channel_autoreply_updated',
                (msg: PluginWebSocketMessage<ChannelAutoReplyUpdatedEvent>) => {
                    handleChannelAutoReplyUpdated(
                        () => botsFromState(store.getState()),
                        msg.data,
                    );
                },
            );

            // Warm the runtime bots cache so the synchronous shouldRender can
            // see agent availability before any AI surface has been opened.
            fetchAndStoreBots(store.dispatch).catch(() => { /* best effort */ });
        }

        registry.registerChannelHeaderButtonAction(<ChannelHeaderIcon/>, () => {
            store.dispatch(rhs.toggleRHSPlugin);
        },
        appLabel,
        appLabel,
        );

        if (registry.registerNewMessagesSeparatorActionComponent) {
            registry.registerNewMessagesSeparatorActionComponent(UnreadsSummarize);
        }

        if (registry.registerChannelHeaderIcon) {
            registry.registerChannelHeaderIcon(AskChannelButton);
        }

        // Slash commands: /ask-channel is the app's search; /summarize-channel asks the person's agent.
        registry.registerSlashCommandWillBePostedHook((message: string, args: any) => {
            if (message.startsWith('/ask-channel')) {
                const query = message.replace('/ask-channel', '').trim();
                return handleAskChannelCommand(query, args, store, rhs);
            } else if (message.startsWith('/summarize-channel')) {
                const commandParams = message.replace('/summarize-channel', '').trim();
                return handleSummarizeChannelCommand(commandParams, args, store);
            }
            return {message, args};
        });

        if (registry.registerRootComponent) {
            registry.registerRootComponent(CustomPromptsManagement);
        }

        // No page of its own: the AI chat registers no product and no route (its old agents page is the server's
        // Integrations › Agents now).

        if (registry.registerSearchComponents) {
            registry.registerSearchComponents({
                buttonComponent: SearchButton,
                suggestionsComponent: () => null,
                hintsComponent: SearchHints,
                action: async (searchTerms: string) => {
                    // Resolve the active bot from the shared selected-agent preference.
                    const state = store.getState() as any;
                    const bots = state['plugins-' + manifest.id]?.bots || [];
                    const activeBot = resolveActiveBot(bots, getSelectedAgentId(state));

                    const result = await doRunSearch(
                        searchTerms,
                        '',
                        '',
                        activeBot?.username,
                    );
                    doSelectPost(result.postid, result.channelid, store.dispatch);
                },
            });
        }

        // Register Custom Prompts AI action menu item
        if (registry.registerAIActionMenuItemComponent) {
            registry.registerAIActionMenuItemComponent({
                icon: <CodeTagsIcon size={18}/>,
                text: <FormattedMessage defaultMessage='Custom prompts'/>,
                sortOrder: 10,
                component: CustomPromptsDropdown,
            });
        }
    }

    private async blockFastBotNotifications(
        post: any,
        msgProps: any,
        channel: any,
        teamId: string,
        args: any,
    ): Promise<{args?: any; error?: string}> {
        const state = this.store?.getState();
        const parentPost = post?.root_id ? state?.entities.posts.posts[post.root_id] : null;
        const currentUserId = state?.entities.users.currentUserId;

        if (shouldSuppressBotNotification(post, {currentUserId, parentPost, now: Date.now()})) {
            return {args: {...args, notify: false}};
        }
        return {args};
    }
}

declare global {
    interface Window {
        basename?: string
        registerPlugin(pluginId: string, plugin: Plugin): void
        WebappUtils?: any
    }
}

window.registerPlugin(manifest.id, new Plugin());

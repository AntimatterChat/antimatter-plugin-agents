// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package conversations_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/autoreply"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/conversations"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/llm"
	"github.com/mattermost/mattermost/server/public/model"
)

// Once the server's agent runtime answers for the agents (the app's manifest says so), the app answers none of the
// posts the runtime answers: mentions of agents, direct messages with them, replies in their threads, and nothing
// from bots or apps (activate_ai is gone). One answer per post: the server's. Only the per-channel auto-reply, which
// the server doesn't have yet, still answers a person's message the runtime won't answer.
func TestServerAnswersAgents(t *testing.T) {
	dm := &model.Channel{Id: "ardm-channel-id", Type: model.ChannelTypeDirect, Name: autoReplyBotUserID + "__" + autoReplyUserID}

	cases := []struct {
		name        string
		setting     bool
		channel     *model.Channel
		buildPost   func(env *autoReplyTestEnv) *model.Post
		expectFired bool
	}{
		{
			name: "a mention of an agent: the server answers",
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				return env.rootPost(autoReplyUserID, "@"+autoReplyBotUsername+" what's new?")
			},
		},
		{
			name:    "a mention in an auto-reply channel: the server answers, not the auto-reply",
			setting: true,
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				return env.rootPost(autoReplyUserID, "@"+autoReplyBot2Username+" what's new?")
			},
		},
		{
			name:    "a direct message with an agent: the server answers",
			channel: dm,
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				post := env.rootPost(autoReplyUserID, "hello")
				post.ChannelId = dm.Id
				return post
			},
		},
		{
			name: "a bot's post asking with activate_ai: nobody answers",
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				post := env.rootPost(autoReplyForeignBotID, "@"+autoReplyBotUsername+" summarise")
				post.AddProp(conversations.ActivateAIProp, "true")
				return post
			},
		},
		{
			name:    "a reply in a thread the agent answered in an auto-reply channel, the root mentioning it: the server answers",
			setting: true,
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				root := &model.Post{Id: autoReplyRootID, ChannelId: autoReplyChannelID, UserId: autoReplyUserID, Message: "@" + autoReplyBotUsername + " plan it", CreateAt: 100}
				reply := &model.Post{Id: autoReplyReplyID, ChannelId: autoReplyChannelID, UserId: autoReplyUserID, RootId: autoReplyRootID, Message: "and the date?", CreateAt: 300}
				env.setThread(autoReplyRootID, root, reply)
				env.amClient.posts = map[string]*model.Post{root.Id: root}
				return reply
			},
		},
		{
			name:    "a reply in a thread an agent started: the server answers",
			setting: true,
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				root := &model.Post{Id: autoReplyRootID, ChannelId: autoReplyChannelID, UserId: autoReplyBotUserID, Message: "Daily digest", CreateAt: 100}
				reply := &model.Post{Id: autoReplyReplyID, ChannelId: autoReplyChannelID, UserId: autoReplyUserID, RootId: autoReplyRootID, Message: "thanks", CreateAt: 300}
				env.setThread(autoReplyRootID, root, reply)
				env.amClient.posts = map[string]*model.Post{root.Id: root}
				return reply
			},
		},
		{
			name: "no auto-reply: a plain message stays unanswered, without the old reminder",
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				return env.threadReply(autoReplyUserID, "thanks!", true)
			},
		},
		{
			name:    "auto-reply: a person's plain root message is still answered by the app",
			setting: true,
			buildPost: func(env *autoReplyTestEnv) *model.Post {
				return env.rootPost(autoReplyUserID, "how do I reset my password?")
			},
			expectFired: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := setupAutoReplyTestEnv(t,
				[]llm.BotConfig{autoReplyBotConfig(), autoReplySecondBotConfig()},
				dmMakeTextStream("canned reply"),
			)
			env.conversations.SetServerAnswersAgents(true)
			if tc.channel != nil {
				env.amClient.channels[tc.channel.Id] = tc.channel
			}
			if tc.setting {
				env.settings.set(autoreply.Setting{ChannelID: autoReplyChannelID, BotID: autoReplyBotUserID, Mode: autoreply.ModeThreads})
			}

			post := tc.buildPost(env)
			env.conversations.MessageHasBeenPosted(nil, post)

			if tc.expectFired {
				require.Len(t, env.amClient.createdPosts, 1, "the auto-reply answers")
				require.Equal(t, autoReplyBotUserID, env.amClient.createdPosts[0].UserId)
			} else {
				require.Empty(t, env.amClient.createdPosts, "the app doesn't answer: the server does")
				require.Empty(t, allConversations(env.convStore), "and starts no conversation of its own")
			}
			require.Empty(t, env.amClient.ephemeralPosts, "no reminder to mention the agent: replies in its threads are answered")
		})
	}
}

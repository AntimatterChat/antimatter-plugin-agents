// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package conversations

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
)

// The hand-over to the server's agents (Antimatter). The app's bots became agents of the server, whose agent runtime
// answers mentions of agents, direct messages with them and replies in their threads, once per post (a claim per
// agent and post), for the people who may use them, with their permissions. This app says so in its manifest
// (props.antimatter_agents_in_server), so the runtime answers its agents too; the app answers none of these posts in
// its message hooks any more. Only its per-channel auto-reply, which the server doesn't have yet, still answers the
// messages of a channel set for it that the runtime won't answer.

// SetServerAnswersAgents makes the server's agent runtime the one that answers (see above).
func (c *Conversations) SetServerAnswersAgents(v bool) {
	c.serverAnswersAgents = v
}

// handleMessagesLeftToServer is what the app still does with a person's post once the server answers for agents.
func (c *Conversations) handleMessagesLeftToServer(ctx context.Context, post *model.Post, postingUser *model.User, channel *model.Channel) error {
	if postingUser.IsBot || post.GetProp(FromBotProp) != nil || post.GetProp(FromPluginProp) != nil {
		// activate_ai is gone with the app's answers: agents don't answer bots or apps.
		return fmt.Errorf("agents answer people only: %w", ErrNoResponse)
	}
	setting := c.autoReplySettingForChannel(channel)
	if setting == nil {
		return fmt.Errorf("the server's agent runtime answers agents: %w", ErrNoResponse)
	}
	if c.serverRuntimeAnswers(post, channel) {
		return fmt.Errorf("the server's agent runtime answers this post: %w", ErrNoResponse)
	}
	return c.handleAutoReply(ctx, setting, post, postingUser, channel)
}

var agentMentionPattern = regexp.MustCompile(`(?:^|[^\w@./-])@([a-zA-Z0-9][a-zA-Z0-9._-]*)`)

// mentionedUsernames gives the usernames a message mentions, as the server's runtime reads them.
func mentionedUsernames(message string) []string {
	var names []string
	for _, m := range agentMentionPattern.FindAllStringSubmatch(message, -1) {
		if name := strings.ToLower(strings.TrimRight(m[1], ".-_")); name != "" {
			names = append(names, name)
		}
	}
	return names
}

func (c *Conversations) isBotUsername(name string) bool {
	u, err := c.amClient.GetUserByUsername(name)
	return err == nil && u != nil && u.IsBot
}

func (c *Conversations) isBotUser(id string) bool {
	u, err := c.amClient.GetUser(id)
	return err == nil && u != nil && u.IsBot
}

// serverRuntimeAnswers tells whether the server's agent runtime answers a post, by its rules (the server's
// agent_runtime.go): a post mentioning an agent; else a direct message with one; else a reply mentioning nobody in a
// thread an agent started, or whose first message, by the same person, mentioned one. Agents are bots: a bot here
// counts as an agent (the app can't tell them apart), so the app rather leaves a post unanswered than answer it twice.
func (c *Conversations) serverRuntimeAnswers(post *model.Post, channel *model.Channel) bool {
	mentioned := mentionedUsernames(post.Message)
	for _, name := range mentioned {
		if c.isBotUsername(name) {
			return true
		}
	}
	if channel.Type == model.ChannelTypeDirect {
		return c.isBotUser(channel.GetOtherUserIdForDM(post.UserId))
	}
	if post.RootId == "" || len(mentioned) > 0 {
		return false
	}
	root, err := c.amClient.GetPost(post.RootId)
	if err != nil {
		// Unknown: leave it to the server rather than answer twice.
		return true
	}
	if c.isBotUser(root.UserId) {
		return true
	}
	if root.UserId != post.UserId {
		return false
	}
	for _, name := range mentionedUsernames(root.Message) {
		if c.isBotUsername(name) {
			return true
		}
	}
	return false
}

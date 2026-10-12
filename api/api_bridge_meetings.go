// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package api

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/meetings"
)

type bridgeSummarizeTranscriptionRequest struct {
	// The transcription post, by the meeting plugin's bot.
	PostID string `json:"post_id"`
	// Who asked for it: the summary uses their permissions and the agents they may use.
	UserID string `json:"user_id"`
	// The agent's username; the default agent when empty.
	Agent string `json:"agent"`
}

// handleBridgeSummarizeTranscription summarizes a call's transcription in the call's thread, for a meeting plugin.
func (a *API) handleBridgeSummarizeTranscription(c *gin.Context) {
	var req bridgeSummarizeTranscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PostID == "" || req.UserID == "" {
		c.AbortWithError(http.StatusBadRequest, errors.New("post_id and user_id are required"))
		return
	}

	post, err := a.pluginAPI.Post.GetPost(req.PostID)
	if err != nil {
		c.AbortWithError(http.StatusNotFound, fmt.Errorf("unable to get the post: %w", err))
		return
	}
	if !a.pluginAPI.User.HasPermissionToChannel(req.UserID, post.ChannelId, model.PermissionReadChannel) {
		c.AbortWithError(http.StatusForbidden, errors.New("the user can't read the channel"))
		return
	}
	requester, err := a.pluginAPI.User.Get(req.UserID)
	if err != nil {
		c.AbortWithError(http.StatusNotFound, fmt.Errorf("unable to get the user: %w", err))
		return
	}

	agent := req.Agent
	if agent == "" {
		agent = a.config.GetDefaultBotName()
	}
	bot := a.bots.GetBotByUsernameOrFirst(agent)
	if bot == nil {
		c.AbortWithError(http.StatusServiceUnavailable, errors.New("no agent is configured"))
		return
	}
	if restrictionErr := a.bots.CheckUsageRestrictionsForUser(c.Request.Context(), bot, req.UserID); restrictionErr != nil {
		c.AbortWithError(http.StatusForbidden, restrictionErr)
		return
	}

	summary, err := a.meetingsService.SummarizeTranscriptionInThread(bot, requester, post)
	if err != nil {
		if errors.Is(err, meetings.ErrNotMeetingBotPost) || errors.Is(err, meetings.ErrNoCaptions) {
			c.AbortWithError(http.StatusBadRequest, err)
			return
		}
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}
	c.Render(http.StatusOK, render.JSON{Data: map[string]string{"post_id": summary.Id}})
}

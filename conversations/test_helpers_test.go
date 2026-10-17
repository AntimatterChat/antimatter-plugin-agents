// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package conversations_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/accesscontrol"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/bots"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/llm"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/mcp"
	"github.com/mattermost/mattermost/server/public/model"
)

// newPassthroughAccessChecker builds an ABAC checker that always reports
// no_policy, so tests exercise pure legacy permission behavior.
func newPassthroughAccessChecker() *accesscontrol.Checker {
	return accesscontrol.New(accesscontrol.PassthroughClient{}, nil, accesscontrol.NoMCPServerIDs, nil)
}

type fakeWebSocketEvent struct {
	event     string
	payload   map[string]any
	broadcast *model.WebsocketBroadcast
}

type fakeAMClient struct {
	users                map[string]*model.User
	postThreads          map[string]*model.PostList
	kv                   map[string]any
	createdPosts         []*model.Post
	allowCreatePost      bool
	updatedPosts         []*model.Post
	kvDeletes            []string
	posts                map[string]*model.Post
	channels             map[string]*model.Channel
	ephemeralPosts       []*model.Post
	ephemeralPostUserIDs []string
	fileInfos            map[string]*model.FileInfo
	onUpdatePost         func(*model.Post)
	websocketEvents      []fakeWebSocketEvent

	// logMu guards logErrors: background goroutines (e.g. title generation)
	// may log while the test goroutine reads.
	logMu     sync.Mutex
	logErrors []string
}

func (c *fakeAMClient) GetUser(userID string) (*model.User, error) {
	user, ok := c.users[userID]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (c *fakeAMClient) GetPostThread(postID string) (*model.PostList, error) {
	postList, ok := c.postThreads[postID]
	if !ok {
		return nil, errors.New("thread not found")
	}
	return postList, nil
}

func (c *fakeAMClient) CreatePost(post *model.Post) error {
	if !c.allowCreatePost {
		return errors.New("not implemented")
	}
	c.createdPosts = append(c.createdPosts, post.Clone())
	return nil
}

func (c *fakeAMClient) UpdatePost(post *model.Post) error {
	c.updatedPosts = append(c.updatedPosts, post.Clone())
	if c.onUpdatePost != nil {
		c.onUpdatePost(post)
	}
	return nil
}

func (c *fakeAMClient) KVGet(key string, value any) error {
	stored, ok := c.kv[key]
	if !ok {
		return errors.New("not found")
	}
	data, err := json.Marshal(stored)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, value)
}

func (c *fakeAMClient) KVSet(key string, value any) error {
	if c.kv == nil {
		c.kv = make(map[string]any)
	}
	c.kv[key] = value
	return nil
}

func (c *fakeAMClient) KVSetWithExpiry(key string, value any, _ time.Duration) error {
	return c.KVSet(key, value)
}

func (c *fakeAMClient) KVCompareAndSet(key string, oldValue, newValue any) (bool, error) {
	if c.kv == nil {
		c.kv = make(map[string]any)
	}
	current, ok := c.kv[key]
	if oldValue == nil {
		if ok {
			return false, nil
		}
		c.kv[key] = newValue
		return true, nil
	}
	if !ok {
		return false, nil
	}
	currentJSON, err := json.Marshal(current)
	if err != nil {
		return false, err
	}
	oldJSON, err := json.Marshal(oldValue)
	if err != nil {
		return false, err
	}
	if string(currentJSON) != string(oldJSON) {
		return false, nil
	}
	c.kv[key] = newValue
	return true, nil
}

func (c *fakeAMClient) KVCompareAndSetWithExpiry(key string, oldValue, newValue any, _ time.Duration) (bool, error) {
	return c.KVCompareAndSet(key, oldValue, newValue)
}

func (c *fakeAMClient) KVDelete(key string) error {
	delete(c.kv, key)
	c.kvDeletes = append(c.kvDeletes, key)
	return nil
}

func (c *fakeAMClient) AddReaction(*model.Reaction) error {
	return errors.New("not implemented")
}

func (c *fakeAMClient) GetPost(postID string) (*model.Post, error) {
	if c.posts != nil {
		if post, ok := c.posts[postID]; ok {
			return post, nil
		}
	}
	return nil, errors.New("post not found")
}

func (c *fakeAMClient) GetPostsSince(string, int64) (*model.PostList, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) GetPostsBefore(string, string, int, int) (*model.PostList, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) DM(string, string, *model.Post) error {
	return errors.New("not implemented")
}

func (c *fakeAMClient) GetTeam(string) (*model.Team, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) GetChannel(channelID string) (*model.Channel, error) {
	if c.channels != nil {
		if ch, ok := c.channels[channelID]; ok {
			return ch, nil
		}
	}
	return nil, errors.New("channel not found")
}

func (c *fakeAMClient) GetDirectChannel(string, string) (*model.Channel, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) PublishWebSocketEvent(event string, payload map[string]any, broadcast *model.WebsocketBroadcast) {
	c.websocketEvents = append(c.websocketEvents, fakeWebSocketEvent{
		event:     event,
		payload:   payload,
		broadcast: broadcast,
	})
}

func (c *fakeAMClient) GetConfig() *model.Config {
	return &model.Config{}
}

func (c *fakeAMClient) LogError(msg string, _ ...any) {
	c.logMu.Lock()
	defer c.logMu.Unlock()
	c.logErrors = append(c.logErrors, msg)
}

// loggedErrors returns a snapshot of the error-level log messages.
func (c *fakeAMClient) loggedErrors() []string {
	c.logMu.Lock()
	defer c.logMu.Unlock()
	return append([]string(nil), c.logErrors...)
}

func (c *fakeAMClient) LogWarn(string, ...any) {}

func (c *fakeAMClient) GetUserByUsername(username string) (*model.User, error) {
	for _, u := range c.users {
		if u.Username == username {
			return u, nil
		}
	}
	return nil, errors.New("user not found")
}

func (c *fakeAMClient) GetUserStatus(string) (*model.Status, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) HasPermissionTo(string, *model.Permission) bool {
	return true
}

func (c *fakeAMClient) GetPluginStatus(string) (*model.PluginStatus, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) PluginHTTP(*http.Request) *http.Response {
	return nil
}

func (c *fakeAMClient) LogDebug(string, ...any) {}

func (c *fakeAMClient) GetChannelByName(string, string, bool) (*model.Channel, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) HasPermissionToChannel(string, string, *model.Permission) bool {
	return true
}

func (c *fakeAMClient) HasPermissionToFileAction(sessionID, _, _ string) bool {
	return sessionID != ""
}

func (c *fakeAMClient) GetFileInfo(fileID string) (*model.FileInfo, error) {
	if c.fileInfos != nil {
		if info, ok := c.fileInfos[fileID]; ok {
			return info, nil
		}
	}
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) GetFile(string) (io.ReadCloser, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) UploadFile(io.Reader, string, string) (*model.FileInfo, error) {
	return nil, errors.New("not implemented")
}

func (c *fakeAMClient) SendEphemeralPost(userID string, post *model.Post) {
	c.ephemeralPosts = append(c.ephemeralPosts, post.Clone())
	c.ephemeralPostUserIDs = append(c.ephemeralPostUserIDs, userID)
}

type fakeStreamingService struct {
	streamedPosts []*model.Post
}

func (s *fakeStreamingService) StreamToNewPost(_ context.Context, _ string, _ string, _ *llm.TextStreamResult, post *model.Post, _ string) error {
	s.streamedPosts = append(s.streamedPosts, post.Clone())
	return nil
}

func (s *fakeStreamingService) StreamToNewDM(context.Context, string, *llm.TextStreamResult, string, *model.Post, string) error {
	return nil
}

func (s *fakeStreamingService) StreamToPost(_ context.Context, stream *llm.TextStreamResult, _ *model.Post, _ string, _ string) {
	if stream != nil {
		_, _ = stream.ReadAll()
	}
}

func (s *fakeStreamingService) StreamContinuationToPost(_ context.Context, stream *llm.TextStreamResult, _ *model.Post, _ string, _ string) {
	if stream != nil {
		_, _ = stream.ReadAll()
	}
}

func (s *fakeStreamingService) StopStreaming(string) {}

func (s *fakeStreamingService) GetStreamingContext(inCtx context.Context, _ string) (context.Context, error) {
	return inCtx, nil
}

func (s *fakeStreamingService) FinishStreaming(string) {}

type testToolProvider struct {
	tools []llm.Tool
}

func (p *testToolProvider) GetTools(_ *bots.Bot, _ *llm.Context) []llm.Tool {
	return p.tools
}

// testToolCallingConfig implements conversations.ConfigProvider for testing
type testToolCallingConfig struct {
	enableChannelMentionToolCalling bool
}

func (c *testToolCallingConfig) EnableChannelMentionToolCalling() bool {
	return c.enableChannelMentionToolCalling
}

func (c *testToolCallingConfig) AllowNativeWebSearchInChannels() bool {
	return false
}

func (c *testToolCallingConfig) MCP() mcp.Config {
	return mcp.Config{}
}

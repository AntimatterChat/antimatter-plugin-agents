// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package conversations

import (
	"net/http"
	"testing"

	"github.com/mattermost/mattermost-plugin-agents/v2/bots"
	"github.com/mattermost/mattermost-plugin-agents/v2/conversation"
	"github.com/mattermost/mattermost-plugin-agents/v2/enterprise"
	"github.com/mattermost/mattermost-plugin-agents/v2/enterprise/enterprisetest"
	"github.com/mattermost/mattermost-plugin-agents/v2/llm"
	"github.com/mattermost/mattermost-plugin-agents/v2/llmcontext"
	"github.com/mattermost/mattermost-plugin-agents/v2/mcp"
	"github.com/mattermost/mattermost-plugin-agents/v2/mmapi/mocks"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/stretchr/testify/mock"
)

const toolLicenseRemoteOrigin = "https://jira.example.com"
const toolLicensePluginOrigin = "plugin://com.mattermost.plugin-playbooks"

// mockLicenseState registers GetConfig/GetLicense expectations reflecting the
// requested license state (enterprise-licensed or unlicensed).
func mockLicenseState(mockAPI *plugintest.API, licensed bool) {
	mockAPI.On("GetConfig").Return(&model.Config{}).Maybe()
	if licensed {
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: model.LicenseShortSkuEnterprise}).Maybe()
	} else {
		mockAPI.On("GetLicense").Return((*model.License)(nil)).Maybe()
	}
}

// toolLicenseChecker returns a LicenseChecker whose Enterprise-level check reports
// the requested state.
func toolLicenseChecker(t *testing.T, licensed bool) *enterprise.LicenseChecker {
	t.Helper()

	mockAPI := &plugintest.API{}
	mockLicenseState(mockAPI, licensed)
	return enterprise.NewLicenseChecker(pluginapi.NewClient(mockAPI, nil))
}

type toolLicenseBuiltinProvider struct {
	tools []llm.Tool
}

func (p *toolLicenseBuiltinProvider) GetTools(*bots.Bot, *llm.Context) []llm.Tool {
	return p.tools
}

// toolLicenseTestBot returns a bot without dynamic MCP tool loading so every
// provided tool is immediately resolvable in the visible tool store.
func toolLicenseTestBot(lm llm.LanguageModel) *bots.Bot {
	return bots.NewBot(
		llm.BotConfig{
			ID:                    "bot-id",
			Name:                  "matty",
			DisplayName:           "Matty",
			AutoEnableNewMCPTools: true,
			UserAccessLevel:       llm.UserAccessLevelAll,
			ChannelAccessLevel:    llm.ChannelAccessLevelAll,
		},
		llm.ServiceConfig{DefaultModel: "test-model", Type: llm.ServiceTypeOpenAI},
		&model.Bot{UserId: "bot-id", Username: "matty", DisplayName: "Matty"},
		lm,
	)
}

func toolLicenseConversations(t *testing.T, convStore *loadedStateFlowStore, licensed bool) (*Conversations, *loadedStateLLM, *loadedStateStreamingService) {
	t.Helper()
	level := enterprise.LevelUnlicensed
	if licensed {
		level = enterprise.LevelEnterprise
	}
	return toolLicenseConversationsAt(t, convStore, level)
}

func toolLicenseConversationsAt(t *testing.T, convStore *loadedStateFlowStore, level enterprise.Level) (*Conversations, *loadedStateLLM, *loadedStateStreamingService) {
	t.Helper()

	mockAPI := &plugintest.API{}
	pluginAPI := pluginapi.NewClient(mockAPI, nil)
	licenseChecker := enterprisetest.CheckerAt(level)
	botsService := bots.New(mockAPI, pluginAPI, licenseChecker, nil, nil, newPassthroughAccessChecker(), &http.Client{}, nil)
	lm := &loadedStateLLM{}
	streamingService := &loadedStateStreamingService{}
	botsService.SetBotsForTesting([]*bots.Bot{toolLicenseTestBot(lm)})

	mmClient := mocks.NewMockClient(t)
	mmClient.On("LogDebug", mock.Anything, mock.Anything).Maybe().Return()
	mmClient.On("GetUser", "user-id").Return(&model.User{Id: "user-id", Username: "user"}, nil).Maybe()
	mmClient.On("GetConfig").Maybe().Return(&model.Config{})

	return &Conversations{
		mmClient:         mmClient,
		contextBuilder:   toolLicenseTestBuilderAt(t, level),
		bots:             botsService,
		licenseChecker:   licenseChecker,
		convService:      conversation.NewService(convStore, nil, nil, nil),
		streamingService: streamingService,
	}, lm, streamingService
}

func toolLicenseTestBuilderAt(t *testing.T, level enterprise.Level) *llmcontext.Builder {
	t.Helper()

	mockAPI := &plugintest.API{}
	enterprisetest.StubLicense(mockAPI, level)
	mockAPI.On("GetTeam", "team-id").Return(&model.Team{Id: "team-id", Name: "team"}, nil).Maybe()
	for i := 1; i <= 10; i++ {
		args := make([]any, i)
		for j := range args {
			args[j] = mock.Anything
		}
		mockAPI.On("LogDebug", args...).Maybe()
		mockAPI.On("LogInfo", args...).Maybe()
		mockAPI.On("LogWarn", args...).Maybe()
		mockAPI.On("LogError", args...).Maybe()
	}

	builtinTools := []llm.Tool{channelFollowUpTestMCPTool("builtin_tool", "", "built-in tool")}
	mcpTools := []llm.Tool{
		channelFollowUpTestMCPTool("mattermost__read_channel", mcp.EmbeddedClientKey, "read channel posts"),
		channelFollowUpTestMCPTool("jira__get_issue", toolLicenseRemoteOrigin, "fetch Jira issue"),
		channelFollowUpTestMCPTool("playbooks__run", toolLicensePluginOrigin, "start a playbook run"),
	}

	return llmcontext.NewLLMContextBuilder(
		pluginapi.NewClient(mockAPI, nil),
		&toolLicenseBuiltinProvider{tools: builtinTools},
		&channelFollowUpTestMCPToolProvider{tools: mcpTools},
		&channelFollowUpTestConfig{},
	)
}

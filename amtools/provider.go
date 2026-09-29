// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package amtools

import (
	"github.com/antimatterchat/antimatter-plugin-agents/v2/amapi"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/bots"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/llm"
)

// ToolProvider provides built-in tools for the AI assistant. The context is
// consulted for catalog inputs such as whether the requesting user is
// interactively present (llm.ToolCatalogContext).
type ToolProvider interface {
	GetTools(bot *bots.Bot, llmContext *llm.Context) []llm.Tool
}

// AMToolProvider implements ToolProvider with all built-in Mattermost tools
type AMToolProvider struct {
	pluginAPI amapi.Client
	webSearch WebSearchService
}

// NewAMToolProvider creates a new tool provider
func NewAMToolProvider(pluginAPI amapi.Client, webSearch WebSearchService) *AMToolProvider {
	return &AMToolProvider{
		pluginAPI: pluginAPI,
		webSearch: webSearch,
	}
}

// GetTools returns all available tools. Tool execution is restricted at runtime via
// WithToolsDisabled() based on context (e.g., DM vs channel). This allows LLMs to be
// aware of tool capabilities even when they can't be executed in the current context.
//
// The exceptions are context-dependent tools: user-interaction tools are only
// cataloged when the context says an interactive user is present (advertising
// them where nobody can answer would strand the conversation), and
// response-file tools are only cataloged when the flow can attach files to
// the response post.
func (p *AMToolProvider) GetTools(bot *bots.Bot, llmContext *llm.Context) []llm.Tool {
	builtInTools := []llm.Tool{}

	if p.pluginAPI != nil && p.webSearch != nil && !hasNativeWebSearch(bot) {
		tool := p.webSearch.Tool()
		if tool != nil {
			builtInTools = append(builtInTools, *tool)
		}

		if sourceTool := p.webSearch.SourceTool(bot); sourceTool != nil {
			builtInTools = append(builtInTools, *sourceTool)
		}
	}

	if p.pluginAPI != nil && llmContext != nil && llmContext.ToolCatalog.ResponseFilesSupported {
		builtInTools = append(builtInTools, NewCreateFileTool(p.pluginAPI))
	}

	if llmContext != nil && llmContext.ToolCatalog.InteractiveUserPresent {
		builtInTools = append(builtInTools, NewAskUserQuestionTool())
	}

	return builtInTools
}

func hasNativeWebSearch(bot *bots.Bot) bool {
	if bot == nil {
		return false
	}

	return bot.HasNativeWebSearchEnabled()
}

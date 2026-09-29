// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package amtools

import (
	"testing"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/amapi"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/amapi/mocks"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/llm"
	"github.com/stretchr/testify/require"
)

// TestGetToolsCreateFileCatalog pins that the CreateFile tool is only
// cataloged when the flow can attach created files to the response post.
func TestGetToolsCreateFileCatalog(t *testing.T) {
	responseFilesCtx := func() *llm.Context {
		return &llm.Context{ToolCatalog: llm.ToolCatalogContext{ResponseFilesSupported: true}}
	}

	tests := []struct {
		name       string
		nilClient  bool
		llmContext *llm.Context
		want       bool
	}{
		{name: "cataloged when response files supported", llmContext: responseFilesCtx(), want: true},
		{name: "not cataloged when response files unsupported", llmContext: &llm.Context{}, want: false},
		{name: "not cataloged with nil context", llmContext: nil, want: false},
		{name: "not cataloged with nil client", nilClient: true, llmContext: responseFilesCtx(), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var client amapi.Client
			if !tt.nilClient {
				client = mocks.NewMockClient(t)
			}
			provider := NewAMToolProvider(client, nil)

			names := []string{}
			for _, tool := range provider.GetTools(nil, tt.llmContext) {
				names = append(names, tool.Name)
			}

			if tt.want {
				require.Contains(t, names, CreateFileToolName)
			} else {
				require.NotContains(t, names, CreateFileToolName)
			}
		})
	}
}

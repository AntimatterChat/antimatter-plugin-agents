// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package config

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-agents/v2/llm"
	"github.com/stretchr/testify/require"
)

func TestAgentPoolOrder(t *testing.T) {
	fileBots := []llm.BotConfig{{Name: "file"}}
	dbAgents := []*llm.BotConfig{
		{ID: "b", Name: "newer", CreateAt: 20},
		nil,
		{ID: "c", Name: "tie-c", CreateAt: 10},
		{ID: "a", Name: "tie-a", CreateAt: 10},
	}

	pool := AgentPool(fileBots, dbAgents)

	names := make([]string, 0, len(pool))
	for _, bot := range pool {
		names = append(names, bot.Name)
	}
	require.Equal(t, []string{"file", "tie-a", "tie-c", "newer"}, names)
	require.Equal(t, "b", dbAgents[0].ID, "input slice must not be reordered")
}

func TestAgentInactiveReasons(t *testing.T) {
	services := []llm.ServiceConfig{
		{ID: "first", Type: llm.ServiceTypeOpenAI, APIKey: "key"},
		{ID: "second", Type: llm.ServiceTypeAnthropic, APIKey: "key"},
		{ID: "no-key", Type: llm.ServiceTypeOpenAI},
	}
	agent := func(name, serviceID string) llm.BotConfig {
		return llm.BotConfig{Name: name, DisplayName: name, ServiceID: serviceID}
	}

	tests := []struct {
		name string
		pool []llm.BotConfig
		want []AgentInactiveReason
	}{
		{
			name: "agents on every service are active",
			pool: []llm.BotConfig{agent("a", "first"), agent("b", "second"), agent("c", "first"), agent("d", "second")},
			want: []AgentInactiveReason{AgentActive, AgentActive, AgentActive, AgentActive},
		},
		{
			name: "deleted service",
			pool: []llm.BotConfig{agent("a", "deleted"), agent("b", "first")},
			want: []AgentInactiveReason{AgentInactiveServiceUnavailable, AgentActive},
		},
		{
			name: "service without credentials",
			pool: []llm.BotConfig{agent("a", "no-key")},
			want: []AgentInactiveReason{AgentInactiveServiceUnavailable},
		},
		{
			name: "invalid agent configuration",
			pool: []llm.BotConfig{{Name: "a", ServiceID: "first"}},
			want: []AgentInactiveReason{AgentInactiveInvalidConfig},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, AgentInactiveReasons(services, tc.pool))
		})
	}
}

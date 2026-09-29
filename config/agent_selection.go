// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package config

import (
	"slices"
	"strings"

	"github.com/mattermost/mattermost-plugin-agents/v2/llm"
)

// AgentInactiveReason explains why an agent is not running. The empty value
// means the agent is active.
type AgentInactiveReason string

const (
	AgentActive                     AgentInactiveReason = ""
	AgentInactiveInvalidConfig      AgentInactiveReason = "invalid_config"
	AgentInactiveServiceUnavailable AgentInactiveReason = "service_unavailable"
)

// AgentPool returns configuration-file bots followed by user-created agents
// ordered by creation time (then ID). dbAgents is not modified; nil entries are skipped.
func AgentPool(fileBots []llm.BotConfig, dbAgents []*llm.BotConfig) []llm.BotConfig {
	sorted := slices.Clone(dbAgents)
	sorted = slices.DeleteFunc(sorted, func(a *llm.BotConfig) bool { return a == nil })
	slices.SortStableFunc(sorted, func(a, b *llm.BotConfig) int {
		if a.CreateAt != b.CreateAt {
			if a.CreateAt < b.CreateAt {
				return -1
			}
			return 1
		}
		return strings.Compare(a.ID, b.ID)
	})

	pool := make([]llm.BotConfig, 0, len(fileBots)+len(sorted))
	pool = append(pool, fileBots...)
	for _, agent := range sorted {
		pool = append(pool, *agent)
	}
	return pool
}

// AgentInactiveReasons classifies each agent in pool (ordered as by
// AgentPool). Agents with an invalid configuration or a missing or incomplete
// LLM service are inactive; every other agent is active.
func AgentInactiveReasons(services []llm.ServiceConfig, pool []llm.BotConfig) []AgentInactiveReason {
	byID := llm.ServiceLookup(services)

	reasons := make([]AgentInactiveReason, len(pool))
	for i, bot := range pool {
		if !bot.IsValid() {
			reasons[i] = AgentInactiveInvalidConfig
			continue
		}
		if svc, ok := byID(bot.ServiceID); !ok || !llm.IsValidService(svc) {
			reasons[i] = AgentInactiveServiceUnavailable
			continue
		}
	}
	return reasons
}

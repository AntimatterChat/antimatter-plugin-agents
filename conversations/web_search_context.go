// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package conversations

import (
	"encoding/json"
	"slices"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/amapi"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/amtools"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/streaming"
	"github.com/mattermost/mattermost/server/public/model"
)

// extractWebSearchContext retrieves web search context from the thread.
// The context may be stored on a previous post if multiple tool calls occurred.
func (c *Conversations) extractWebSearchContext(currentPost *model.Post) map[string]any {
	rootID := currentPost.RootId
	if rootID == "" {
		rootID = currentPost.Id
	}

	// Get thread to search for web search context in previous posts
	threadData, err := amapi.GetThreadData(c.amClient, rootID)
	if err != nil {
		c.amClient.LogDebug("Unable to get thread data for web search context extraction", "error", err)
		return nil
	}

	// Search through posts in reverse order (most recent first) for web search context
	// We want the most recent context in case multiple searches occurred
	for _, post := range slices.Backward(threadData.Posts) {
		webSearchContextProp := post.GetProp(streaming.WebSearchContextProp)
		if webSearchContextProp == nil {
			continue
		}

		webSearchContextJSON, ok := webSearchContextProp.(string)
		if !ok {
			c.amClient.LogWarn("Web search context prop is not a string", "post_id", post.Id)
			continue
		}

		c.amClient.LogDebug("Found web search context in thread",
			"current_post", currentPost.Id,
			"context_post", post.Id)

		return c.unmarshalWebSearchContext(webSearchContextJSON, post.Id)
	}

	c.amClient.LogDebug("No web search context found in thread", "root_id", rootID)
	return nil
}

func (c *Conversations) unmarshalWebSearchContext(webSearchContextJSON string, postID string) map[string]any {
	var params map[string]any
	if err := json.Unmarshal([]byte(webSearchContextJSON), &params); err != nil {
		c.amClient.LogError("Failed to unmarshal web search context", "error", err, "post_id", postID)
		return nil
	}

	// Unmarshaling the literal JSON "null" succeeds and leaves params nil, which
	// would make the unconditional writes below panic ("assignment to entry in
	// nil map"). A user can set this prop to any value, so guard against it.
	if params == nil {
		params = make(map[string]any)
	}

	// Reconstruct proper types for web search context values
	if raw, ok := params[amtools.WebSearchContextKey]; ok {
		// Re-marshal and unmarshal to get proper types
		contextBytes, marshalErr := json.Marshal(raw)
		if marshalErr != nil {
			c.amClient.LogError("Failed to re-marshal web search context", "error", marshalErr, "post_id", postID)
			return nil
		}

		var searchContexts []amtools.WebSearchContextValue
		if unmarshalErr := json.Unmarshal(contextBytes, &searchContexts); unmarshalErr != nil {
			c.amClient.LogError("Failed to unmarshal web search context values", "error", unmarshalErr, "post_id", postID)
			return nil
		}

		params[amtools.WebSearchContextKey] = searchContexts

		c.amClient.LogDebug("Reconstructed web search context",
			"post_id", postID,
			"num_contexts", len(searchContexts))
	}

	// Reconstruct allowed URLs
	if raw, ok := params[amtools.WebSearchAllowedURLsKey]; ok {
		urlBytes, marshalErr := json.Marshal(raw)
		if marshalErr == nil {
			var allowedURLs []string
			if unmarshalErr := json.Unmarshal(urlBytes, &allowedURLs); unmarshalErr == nil {
				params[amtools.WebSearchAllowedURLsKey] = allowedURLs
				c.amClient.LogDebug("Reconstructed allowed URLs", "post_id", postID, "num_urls", len(allowedURLs))
			}
		}
	}

	// Reset search tracking for the new user request cycle
	// The count and executed queries should start fresh for each user question,
	// but we keep the search results and allowed URLs for context/citations
	params[amtools.WebSearchCountKey] = 0
	params[amtools.WebSearchExecutedQueriesKey] = []string{}
	c.amClient.LogDebug("Reset web search tracking for new request cycle", "post_id", postID)

	return params
}

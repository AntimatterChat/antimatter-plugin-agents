// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package mcpserver

import (
	"context"
	"fmt"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/mcpserver/auth"
	loggerlib "github.com/antimatterchat/antimatter-plugin-agents/v2/mcpserver/logger"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/mcpserver/tools"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// AntimatterStdioMCPServer wraps AntimatterMCPServer for STDIO transport
type AntimatterStdioMCPServer struct {
	*AntimatterMCPServer
}

// NewStdioServer creates a new STDIO transport MCP server.
// searchService and fileContentService are optional — if nil, default HTTP-based
// services are created that call back to the plugin's /api/v1 endpoints.
func NewStdioServer(config StdioConfig, logger loggerlib.Logger, searchService tools.SemanticSearchService, fileContentService tools.FileContentService) (*AntimatterStdioMCPServer, error) {
	if config.MMServerURL == "" {
		return nil, fmt.Errorf("server URL cannot be empty")
	}
	if config.PersonalAccessToken == "" {
		return nil, fmt.Errorf("personal access token cannot be empty")
	}

	if logger == nil {
		var err error
		logger, err = loggerlib.CreateDefaultLogger()
		if err != nil {
			return nil, fmt.Errorf("failed to create default logger: %w", err)
		}
	}

	antimatterServer := &AntimatterStdioMCPServer{
		AntimatterMCPServer: &AntimatterMCPServer{
			logger: logger,
			config: config,
		},
	}

	// Create authentication provider
	antimatterServer.authProvider = auth.NewTokenAuthenticationProvider(config.GetMMServerURL(), config.GetMMInternalServerURL(), config.PersonalAccessToken, logger)

	antimatterServer.mcpServer = mcp.NewServer(
		&mcp.Implementation{
			Name:    "mattermost-mcp-server",
			Version: "0.1.0",
		},
		&mcp.ServerOptions{}, // ServerOptions
	)

	// Validate token at startup for STDIO
	if err := antimatterServer.authProvider.ValidateAuth(context.Background()); err != nil {
		return nil, fmt.Errorf("startup token validation failed: %w", err)
	}

	// Use provided services or create default HTTP callback services
	defaultSearchService, defaultFileContentService := newPluginCallbackServices(config.GetMMServerURL())
	if searchService == nil {
		searchService = defaultSearchService
	}
	if fileContentService == nil {
		fileContentService = defaultFileContentService
	}

	// Register tools with local access mode
	antimatterServer.registerTools(tools.AccessModeLocal, searchService, fileContentService)

	return antimatterServer, nil
}

// Serve starts the STDIO MCP server
func (s *AntimatterStdioMCPServer) Serve() error {
	return s.serveStdio()
}

// serveStdio starts the server using stdio transport
func (s *AntimatterMCPServer) serveStdio() error {
	ctx := context.Background()
	if cfg, ok := s.config.(StdioConfig); ok && cfg.PersonalAccessToken != "" {
		// Tool handlers inherit this context. HTTP callbacks (read_file,
		// semantic search) forward the PAT as a bearer token so the plugin
		// can restore a Mattermost session for file-policy checks.
		ctx = context.WithValue(ctx, auth.AuthTokenContextKey, cfg.PersonalAccessToken)
	}

	// Log startup
	s.logger.Info("Starting MCP server with STDIO transport")

	transport := &mcp.StdioTransport{}

	err := s.mcpServer.Run(ctx, transport)
	if err != nil {
		s.logger.Error("MCP server stopped with error", "error", err)
	} else {
		s.logger.Info("MCP server stopped gracefully")
	}
	return err
}

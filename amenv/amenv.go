// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Package amenv reads the plugin's own environment variables. The AM_-prefixed
// name is authoritative; the legacy MM_-prefixed name is still accepted as a
// fallback so existing deployments and scripts keep working.
package amenv

import (
	"os"
	"strings"
)

const (
	prefix       = "AM_"
	legacyPrefix = "MM_"
)

// LegacyName returns the MM_-prefixed fallback for an AM_-prefixed name.
func LegacyName(name string) string {
	if !strings.HasPrefix(name, prefix) {
		return ""
	}
	return legacyPrefix + strings.TrimPrefix(name, prefix)
}

// Get returns the value of the AM_-prefixed variable name when it is set to a
// non-empty value, otherwise the value of its MM_-prefixed legacy counterpart.
func Get(name string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	if legacy := LegacyName(name); legacy != "" {
		return os.Getenv(legacy)
	}
	return ""
}

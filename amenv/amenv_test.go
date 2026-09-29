// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package amenv

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGet(t *testing.T) {
	tests := []struct {
		name   string
		am     string
		mm     string
		expect string
	}{
		{name: "neither set", expect: ""},
		{name: "only legacy set", mm: "legacy", expect: "legacy"},
		{name: "only new set", am: "new", expect: "new"},
		{name: "new wins over legacy", am: "new", mm: "legacy", expect: "new"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("AM_AMENV_TEST_VALUE", tc.am)
			t.Setenv("MM_AMENV_TEST_VALUE", tc.mm)
			require.Equal(t, tc.expect, Get("AM_AMENV_TEST_VALUE"))
		})
	}
}

func TestLegacyName(t *testing.T) {
	require.Equal(t, "MM_SERVER_URL", LegacyName("AM_SERVER_URL"))
	require.Equal(t, "", LegacyName("OTHER"))
}

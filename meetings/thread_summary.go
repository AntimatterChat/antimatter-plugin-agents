// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package meetings

import (
	stdcontext "context"
	"errors"
	"fmt"
	"slices"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/antimatterchat/antimatter-plugin-agents/v2/bots"
	"github.com/antimatterchat/antimatter-plugin-agents/v2/subtitles"
)

// ErrNoCaptions is returned for a transcription post without its timed transcript.
var ErrNoCaptions = errors.New("the transcription post has no captions file")

// SummarizeTranscriptionInThread summarizes the transcription of a call, posted by the bot of a meeting plugin, as a
// reply in the call's thread, for everyone in the channel (where HandleSummarizeTranscription answers the requester
// in a DM). The calling plugin is trusted to have checked that the requester was in the call.
func (s *Service) SummarizeTranscriptionInThread(bot *bots.Bot, requester *model.User, transcriptionPost *model.Post) (*model.Post, error) {
	author, err := s.pluginAPI.User.Get(transcriptionPost.UserId)
	if err != nil {
		return nil, fmt.Errorf("unable to get the transcription's author: %w", err)
	}
	if !author.IsBot || !slices.Contains(MeetingBotUsernames, author.Username) {
		return nil, ErrNotMeetingBotPost
	}
	channel, err := s.pluginAPI.Channel.Get(transcriptionPost.ChannelId)
	if err != nil {
		return nil, fmt.Errorf("unable to get the channel: %w", err)
	}

	fileID, err := GetCaptionsFileIDFromProps(transcriptionPost)
	if err != nil || fileID == "" {
		return nil, ErrNoCaptions
	}
	info, err := s.amClient.GetFileInfo(fileID)
	if err != nil {
		return nil, fmt.Errorf("unable to get the captions file: %w", err)
	}
	if info.ChannelId != channel.Id {
		return nil, errors.New("the captions file isn't in the transcription's channel")
	}
	reader, err := s.amClient.GetFile(fileID)
	if err != nil {
		return nil, fmt.Errorf("unable to read the captions file: %w", err)
	}
	defer reader.Close()
	transcription, err := subtitles.NewSubtitlesFromVTT(reader)
	if err != nil {
		return nil, fmt.Errorf("unable to parse the captions file: %w", err)
	}

	requestContext := s.contextBuilder.BuildLLMContextUserRequest(bot, requester, channel, s.contextBuilder.WithLLMContextNoTools())
	stream, err := s.SummarizeTranscription(stdcontext.Background(), bot, transcription, requestContext)
	if err != nil {
		return nil, fmt.Errorf("unable to summarize the transcription: %w", err)
	}

	rootID := transcriptionPost.RootId
	if rootID == "" {
		rootID = transcriptionPost.Id
	}
	summaryPost := &model.Post{
		ChannelId: channel.Id,
		RootId:    rootID,
	}
	summaryPost.AddProp(ReferencedTranscriptPostID, transcriptionPost.Id)
	if err := s.streamingService.StreamToNewPost(stdcontext.Background(), bot.GetAMBot().UserId, requester.Id, stream, summaryPost, transcriptionPost.Id); err != nil {
		return nil, fmt.Errorf("unable to post the summary: %w", err)
	}
	return summaryPost, nil
}

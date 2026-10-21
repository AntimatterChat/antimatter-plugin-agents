// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import styled from 'styled-components';

// The AI chat's side panel in Fusion's look: Fusion's tokens (--am-*), which follow the theme (light, dark, OLED),
// with the classic web app's colours where Fusion isn't running.

export const t = {
    text: 'var(--am-text, var(--center-channel-color))',
    text2: 'var(--am-text-2, rgba(var(--center-channel-color-rgb), 0.8))',
    muted: 'var(--am-muted, rgba(var(--center-channel-color-rgb), 0.64))',
    faint: 'var(--am-faint, rgba(var(--center-channel-color-rgb), 0.48))',
    line: 'var(--am-line, rgba(var(--center-channel-color-rgb), 0.12))',
    raise: 'var(--am-raise, rgba(var(--center-channel-color-rgb), 0.06))',
    raise2: 'var(--am-raise-2, rgba(var(--center-channel-color-rgb), 0.1))',
    hover: 'var(--am-hover, rgba(var(--center-channel-color-rgb), 0.08))',
    main: 'var(--am-main, var(--center-channel-bg))',
    accent: 'var(--am-matter, var(--button-bg))',
    accentSoft: 'var(--am-matter-soft, rgba(var(--button-bg-rgb), 0.12))',
    danger: 'var(--am-danger, var(--error-text))',
    shadow: 'var(--am-shadow, 0 8px 24px rgba(0, 0, 0, 0.16))',
    fontUI: 'var(--am-font-ui, inherit)',
    fontDisplay: 'var(--am-font-display, inherit)',
};

export const Panel = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    min-width: 0;
    color: ${t.text};
    font-family: ${t.fontUI};
`;

export const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
    min-height: 48px;
    padding: 6px 8px 6px 10px;
    border-bottom: 1px solid ${t.line};
    min-width: 0;
`;

export const Grow = styled.div`
    flex: 1;
    min-width: 0;
`;

export const IconButton = styled.button`
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${t.muted};
    cursor: pointer;

    &:hover, &[aria-pressed='true'], &[aria-expanded='true'] {
        background: ${t.hover};
        color: ${t.text};
    }

    &:focus-visible {
        outline: 2px solid ${t.accent};
        outline-offset: 1px;
    }
`;

export const Body = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
`;

export const Center = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 20px;
    text-align: center;
`;

export const Title = styled.h3`
    margin: 0;
    font: 600 17px/24px ${t.fontDisplay};
    color: ${t.text};
    overflow-wrap: anywhere;
`;

export const Text = styled.p`
    margin: 0;
    max-width: 320px;
    font-size: 13px;
    line-height: 19px;
    color: ${t.muted};
`;

export const SectionHeading = styled.div`
    margin: 16px 16px 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${t.faint};
`;

export const Chips = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 16px;
`;

export const Chip = styled.button`
    max-width: 100%;
    padding: 6px 10px;
    border: 1px solid ${t.line};
    border-radius: 999px;
    background: ${t.raise};
    color: ${t.text2};
    font: 500 12px/16px ${t.fontUI};
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover:not(:disabled) {
        background: ${t.accentSoft};
        color: ${t.accent};
        border-color: transparent;
    }

    &:disabled {
        opacity: 0.6;
        cursor: default;
    }
`;

export const PrimaryButton = styled.button`
    padding: 8px 14px;
    border: 0;
    border-radius: 8px;
    background: ${t.accent};
    color: #FFFFFF;
    font: 600 13px/18px ${t.fontUI};
    cursor: pointer;

    &:hover {
        filter: brightness(1.08);
    }
`;

export const ErrorText = styled.div`
    margin: 8px 16px 0;
    font-size: 12px;
    color: ${t.danger};
`;

export const Avatar = styled.img<{$size?: number}>`
    flex: none;
    width: ${(p) => p.$size ?? 24}px;
    height: ${(p) => p.$size ?? 24}px;
    border-radius: 50%;
    object-fit: cover;
    background: ${t.raise2};
`;

export const Badge = styled.div`
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 4px;
    border-radius: 14px;
    background: ${t.accentSoft};
    color: ${t.accent};
`;

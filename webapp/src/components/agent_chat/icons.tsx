// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

// The AI chat's few icons, drawn as Fusion's are (a 24-unit grid, a 1.8 stroke in the text colour). No pictures.

type Props = {size?: number};

const Glyph = ({size = 18, children}: Props & {children: React.ReactNode}) => (
    <svg
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth={1.8}
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden={true}
        focusable={false}
    >
        {children}
    </svg>
);

export const SparkleIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'/>
        <path d='M19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z'/>
    </Glyph>
);

export const ChevronDownIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M6 9l6 6 6-6'/>
    </Glyph>
);

export const BackIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M15 18l-6-6 6-6'/>
    </Glyph>
);

export const ListIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M8 6h12M8 12h12M8 18h12'/>
        <path d='M4 6h.01M4 12h.01M4 18h.01'/>
    </Glyph>
);

export const ComposeIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M12 20h9'/>
        <path d='M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z'/>
    </Glyph>
);

export const CheckIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M5 12l5 5L20 7'/>
    </Glyph>
);

export const ToolsIcon = (props: Props) => (
    <Glyph {...props}>
        <path d='M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z'/>
    </Glyph>
);

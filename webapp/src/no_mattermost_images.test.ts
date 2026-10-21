// Copyright (c) 2023-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-sync */

import * as fs from 'fs';
import * as path from 'path';

// The AI chat carries no Mattermost artwork any more: no pictures (the old bot icon, the panel's lightbulb, the
// file-drop overlay, the README's and the docs' screenshots), no illustration drawn in code; only small icons, and
// the app's own icon.

const repoRoot = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'build', 'e2e']);
const IMAGE = /\.(png|jpe?g|gif|webp|ico|bmp|svg)$/i;
const ALLOWED_IMAGES = ['assets/icon.svg'];

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (SKIP.has(entry.name)) {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else {
            out.push(full);
        }
    }
    return out;
}

describe('no Mattermost artwork', () => {
    const files = walk(repoRoot).map((f) => path.relative(repoRoot, f).split(path.sep).join('/'));

    test('the only picture is the app\'s own icon', () => {
        expect(files.filter((f) => IMAGE.test(f))).toEqual(ALLOWED_IMAGES);
    });

    test('the manifest uses it', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin.json'), 'utf8'));
        expect(manifest.icon_path).toBe('assets/icon.svg');
    });

    test('the web app imports no picture and draws no illustration', () => {
        const sources = files.filter((f) => f.startsWith('webapp/src/') && (/\.(tsx?|jsx?)$/).test(f) && !f.endsWith('no_mattermost_images.test.ts'));
        const offenders: string[] = [];
        for (const f of sources) {
            const text = fs.readFileSync(path.join(repoRoot, f), 'utf8');
            if ((/from\s+['"][^'"]+\.(png|jpe?g|gif|webp|svg)['"]/).test(text) || (/require\(['"][^'"]+\.(png|jpe?g|gif|webp|svg)['"]\)/).test(text)) {
                offenders.push(`${f}: imports a picture`);
            }

            // An SVG drawn wider or taller than an icon (48 units) is an illustration.
            const viewBox = /viewBox=\{?['"]\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*['"]/g;
            for (let m = viewBox.exec(text); m; m = viewBox.exec(text)) {
                if (Number(m[1]) > 48 || Number(m[2]) > 48) {
                    offenders.push(`${f}: an SVG of ${m[1]}×${m[2]}`);
                }
            }
            if ((/Illustration|bot_icon|rhs_image|sparkles_graphic|file_overlay/).test(text)) {
                offenders.push(`${f}: names the old artwork`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

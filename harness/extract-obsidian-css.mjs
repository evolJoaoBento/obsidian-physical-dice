/*
 * Pulls Obsidian's own stylesheet out of the installed app into
 * harness/obsidian-app.css.
 *
 * Why this is needed: the plugin's styles.css contains only the plugin's own
 * additions. Everything underneath it — `mod-cta`, `mod-warning`, base button
 * and input styling, `.setting-item`, the whole colour-variable system — lives
 * in Obsidian's app.css. Without it the harness renders the plugin's markup on
 * bare browser defaults, which is why "Roll All Dice" showed up white instead
 * of accent-coloured.
 *
 * The extracted file is Obsidian's, not ours: it is gitignored, generated
 * locally from the copy already installed on this machine, and never committed.
 *
 *   node harness/extract-obsidian-css.mjs [path/to/obsidian/resources]
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/** Minimal asar reader — the format is a length-prefixed JSON header then a blob. */
function readAsar(file) {
    const buf = fs.readFileSync(file);
    const headerPickleSize = buf.readUInt32LE(4);
    const headerJsonSize = buf.readUInt32LE(12);
    const header = JSON.parse(buf.toString('utf8', 16, 16 + headerJsonSize));
    const baseOffset = 8 + headerPickleSize;
    return { buf, header, baseOffset };
}

function* walk(node, prefix = '') {
    for (const [name, entry] of Object.entries(node.files || {})) {
        const full = prefix ? `${prefix}/${name}` : name;
        if (entry.files) yield* walk(entry, full);
        else yield [full, entry];
    }
}

function candidateRoots() {
    const roots = [];
    if (process.argv[2]) roots.push(process.argv[2]);
    const home = os.homedir();
    roots.push(
        path.join(home, 'AppData', 'Local', 'Obsidian', 'resources'),
        path.join(home, 'AppData', 'Roaming', 'Obsidian', 'resources'),
        '/Applications/Obsidian.app/Contents/Resources',
        '/opt/Obsidian/resources',
        '/usr/lib/obsidian/resources'
    );
    return roots.filter((r) => fs.existsSync(r));
}

const roots = candidateRoots();
if (!roots.length) {
    console.error('Could not find an Obsidian install. Pass the resources directory as an argument.');
    process.exit(1);
}

let written = false;

for (const root of roots) {
    for (const archive of ['obsidian.asar', 'app.asar']) {
        const file = path.join(root, archive);
        if (!fs.existsSync(file)) continue;

        let asar;
        try {
            asar = readAsar(file);
        } catch (error) {
            console.warn(`  skipping ${archive}: ${error.message}`);
            continue;
        }

        for (const [name, entry] of walk(asar.header)) {
            if (!name.endsWith('.css')) continue;
            const start = asar.baseOffset + Number(entry.offset);
            const css = asar.buf.subarray(start, start + entry.size).toString('utf8');

            // app.css is the one that carries the theme variables and mod-cta.
            if (!/--background-primary/.test(css)) continue;

            const out = path.join('harness', 'obsidian-app.css');
            fs.writeFileSync(out, css);
            console.log(`  ${archive}:${name} -> ${out}  (${(css.length / 1024).toFixed(0)} KB)`);
            written = true;
            break;
        }
        if (written) break;
    }
    if (written) break;
}

if (!written) {
    console.error(
        'Found an Obsidian install but no stylesheet with theme variables in it.\n' +
        'The harness still runs; it just falls back to the small variable set in harness.css.'
    );
    process.exit(1);
}

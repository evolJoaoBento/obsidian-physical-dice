/*
 * Drives the real Obsidian over the Chrome DevTools Protocol.
 *
 * Obsidian is Electron, so when it is launched with
 * `--remote-debugging-port=9222` its renderer is a debuggable page like any
 * other. Attaching to it means there is no stub, no replica and no fidelity gap
 * to argue about: it is the actual app, the actual plugin, the actual settings
 * modal, with the real vault behind it.
 *
 * Launch Obsidian with the port first:
 *   Stop-Process -Name obsidian; & "$env:LOCALAPPDATA\Obsidian\Obsidian.exe" --remote-debugging-port=9222
 *
 * Then:
 *   node harness/obsidian-cdp.mjs eval "app.plugins.plugins.dsix.settings.diceSize"
 *   node harness/obsidian-cdp.mjs eval-file probe.js
 *   node harness/obsidian-cdp.mjs shot out.png
 *   node harness/obsidian-cdp.mjs click 240 195
 *   node harness/obsidian-cdp.mjs drag 100 100 400 300
 *   node harness/obsidian-cdp.mjs reload
 *
 * The debug port lets anything on this machine drive Obsidian. It is bound to
 * localhost, but close it when you are done by restarting Obsidian normally.
 */

import fs from 'fs';
import path from 'path';

const PORT = Number(process.env.OBSIDIAN_CDP_PORT || 9222);
const HOST = '127.0.0.1';

async function mainTarget() {
    const res = await fetch(`http://${HOST}:${PORT}/json/list`);
    const targets = await res.json();
    const page = targets.find(
        (t) => t.type === 'page' && String(t.url).startsWith('app://obsidian.md')
    );
    if (!page) {
        throw new Error(
            'No Obsidian window found on the debug port. Is Obsidian running with ' +
            '--remote-debugging-port=' + PORT + '?'
        );
    }
    return page;
}

/** Minimal CDP client: connect, run a sequence of commands, close. */
async function withSession(fn) {
    const target = await mainTarget();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;

    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });

    ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
        }
    });

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });

    // Obsidian usually sits behind the terminal that is driving it, and Chromium
    // throttles a window it considers hidden: requestAnimationFrame stops
    // entirely and setTimeout is clamped to about once a second. Tests then fail
    // for reasons that have nothing to do with the code under test. These two
    // make the page behave as a focused, visible one no matter where it is.
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});

    try {
        return await fn(send);
    } finally {
        ws.close();
    }
}

/**
 * Evaluate in the renderer. The expression is wrapped so top-level await works
 * and so the value comes back as JSON rather than a remote object handle.
 */
async function evaluate(send, expression) {
    const wrapped = `(async () => {
        const __v = await (async () => { ${expression} })();
        try { return JSON.stringify(__v, null, 1) ?? String(__v); }
        catch { return String(__v); }
    })()`;

    const result = await send('Runtime.evaluate', {
        expression: wrapped,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
    });

    if (result.exceptionDetails) {
        const e = result.exceptionDetails;
        throw new Error(e.exception?.description || e.text);
    }
    return result.result.value;
}

async function mouse(send, type, x, y, extra = {}) {
    await send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
        buttons: type === 'mouseReleased' ? 0 : 1,
        ...extra
    });
}

const [command, ...args] = process.argv.slice(2);

const commands = {
    async eval(send) {
        const expr = args.join(' ');
        // A bare expression is far commoner than a statement block.
        const body = /\breturn\b|;/.test(expr) ? expr : `return (${expr});`;
        return evaluate(send, body);
    },

    async 'eval-file'(send) {
        const file = args[0];
        if (!file) throw new Error('eval-file needs a path');
        return evaluate(send, fs.readFileSync(file, 'utf8'));
    },

    /** shot <file> [x y w h [scale]] — the clip is in CSS pixels. */
    async shot(send) {
        const out = path.resolve(args[0] || 'obsidian.png');
        // A backgrounded Chromium window throttles rAF to nothing, so anything
        // animated is frozen mid-motion until the window is brought forward.
        await send('Page.bringToFront').catch(() => {});

        const params = { format: 'png' };
        if (args.length >= 5) {
            const [x, y, width, height, scale] = args.slice(1).map(Number);
            params.clip = { x, y, width, height, scale: scale || 2 };
            params.captureBeyondViewport = true;
        }

        const { data } = await send('Page.captureScreenshot', params);
        fs.writeFileSync(out, Buffer.from(data, 'base64'));
        return `saved ${out}`;
    },

    async front(send) {
        await send('Page.bringToFront');
        return 'Obsidian brought to the front';
    },

    /**
     * bounds [width height] — resize the Obsidian window, or report its size.
     *
     * Worth having because a short or oddly shaped window silently changes what
     * a screenshot is worth: the tray is sized from the window, so the dice and
     * their shadows come out too small to judge.
     */
    async bounds(send) {
        const [width, height] = args.map(Number);
        // Electron does not expose CDP's Browser domain, so this goes through
        // the renderer's own remote handle to the BrowserWindow.
        return evaluate(send, `
            if (${Number.isFinite(width) && Number.isFinite(height)}) {
                const remote = require('electron').remote || require('@electron/remote');
                const win = remote.getCurrentWindow();
                win.unmaximize();
                win.setBounds({ x: 60, y: 60, width: ${width || 0}, height: ${height || 0} });
                await new Promise((r) => setTimeout(r, 400));
            }
            return { width: window.innerWidth, height: window.innerHeight };
        `);
    },

    /**
     * Drive the plugin's render loop by hand, for when the window cannot be
     * focused. Same trick as the browser harness: real animate(), synthetic
     * clock, so physics advances deterministically without waiting on rAF.
     */
    async pump(send) {
        const frames = Number(args[0] || 240);
        return evaluate(
            send,
            `
            const d = app.plugins.plugins.dsix?.dice;
            if (!d) return 'overlay closed';
            let settledAt = null;
            for (let i = 0; i < ${frames}; i++) {
                if (d.animationId !== null) { cancelAnimationFrame(d.animationId); d.animationId = null; }
                d.lastFrameTime = performance.now() - 1000 / 60;
                d.animate();
                if (settledAt === null &&
                    d.diceBodyArray.length &&
                    d.diceBodyArray.every((b) => b.sleepState === 2)) {
                    settledAt = i + 1;
                }
            }
            if (d.animationId !== null) { cancelAnimationFrame(d.animationId); d.animationId = null; }
            return {
                frames: ${frames},
                settledAfter: settledAt,
                sleep: d.diceBodyArray.map((b) => b.sleepState)
            };`
        );
    },

    async click(send) {
        const [x, y] = args.map(Number);
        await mouse(send, 'mouseMoved', x, y, { buttons: 0 });
        await mouse(send, 'mousePressed', x, y);
        await mouse(send, 'mouseReleased', x, y);
        return `clicked ${x},${y}`;
    },

    async drag(send) {
        const [x1, y1, x2, y2] = args.map(Number);
        await mouse(send, 'mouseMoved', x1, y1, { buttons: 0 });
        await mouse(send, 'mousePressed', x1, y1);
        // Several intermediate moves: one big jump reads as a teleport to any
        // handler that measures velocity, which the dice drag does.
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
            await mouse(send, 'mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
            await new Promise((r) => setTimeout(r, 16));
        }
        await mouse(send, 'mouseReleased', x2, y2);
        return `dragged ${x1},${y1} -> ${x2},${y2}`;
    },

    async key(send) {
        for (const ch of args.join(' ')) {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', text: ch });
        }
        return 'typed';
    },

    async reload(send) {
        // Obsidian's own reload keeps the vault; a raw Page.reload can wedge it.
        return evaluate(send, `app.commands.executeCommandById('app:reload'); return 'reloading';`);
    },

    async targets() {
        const res = await fetch(`http://${HOST}:${PORT}/json/list`);
        return JSON.stringify(await res.json(), null, 1);
    }
};

if (!command || !commands[command]) {
    console.error(`usage: node harness/obsidian-cdp.mjs <${Object.keys(commands).join('|')}> [args]`);
    process.exit(1);
}

try {
    const out =
        command === 'targets' ? await commands.targets() : await withSession(commands[command]);
    console.log(out);
} catch (error) {
    console.error(`[cdp] ${error.message}`);
    process.exit(1);
}

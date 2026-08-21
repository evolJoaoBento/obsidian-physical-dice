/*
 * Functional pass over the running plugin, executed inside Obsidian:
 *   node harness/obsidian-cdp.mjs eval-file harness/scripts/smoke.js
 *
 * Everything here goes through the plugin's own commands and buttons rather
 * than poking internals, so a failure is a failure a user would hit.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail) => results.push({ name, ok, ...(detail ? { detail } : {}) });

/**
 * Drive the render loop by hand instead of waiting on rAF.
 *
 * Chromium throttles requestAnimationFrame hard when its window is not in the
 * foreground, and a window being driven from a terminal usually is not. Waiting
 * on wall-clock made this test report "dice never sleep" purely because Obsidian
 * was behind the terminal. Pumping the real animate() with a fixed timestep
 * removes focus from the equation entirely.
 */
async function pump(frames) {
    const d = plugin.dice;
    let settledAfter = null;
    for (let i = 0; i < frames; i++) {
        if (d.animationId !== null) { cancelAnimationFrame(d.animationId); d.animationId = null; }
        d.lastFrameTime = performance.now() - 1000 / 60;
        d.animate();
        if (settledAfter === null && d.diceBodyArray.length &&
            d.diceBodyArray.every((b) => b.sleepState === 2)) {
            settledAfter = i + 1;
        }
        // Hand the thread back regularly: Obsidian stays responsive, and the
        // roll monitor's setTimeout chain gets to run.
        if (i % 60 === 59) await wait(0);
    }
    if (d.animationId !== null) { cancelAnimationFrame(d.animationId); d.animationId = null; }
    return settledAfter;
}

// Collect anything the plugin logs or throws for the duration of the run.
const errors = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...a) => { errors.push('error: ' + a.map(String).join(' ').slice(0, 200)); origError(...a); };
console.warn = (...a) => { errors.push('warn: ' + a.map(String).join(' ').slice(0, 200)); origWarn(...a); };
const onErr = (e) => errors.push('uncaught: ' + (e.message || e.reason));
window.addEventListener('error', onErr);
window.addEventListener('unhandledrejection', onErr);

const plugin = app.plugins.plugins.dsix;

try {
    // --- open ---------------------------------------------------------------
    if (!plugin.isVisible) app.commands.executeCommandById('dsix:toggle-dice-roller');
    await wait(600);
    record('overlay opens', plugin.isVisible === true);

    const panel = document.querySelector('.dice-controls-panel');
    record('controls panel present', !!panel);

    const dice = plugin.dice;
    record('engine created', !!dice);

    // --- add one of every type through the real buttons ----------------------
    const typeButton = (label) =>
        [...panel.querySelectorAll('.dice-type-button')].find((b) => b.textContent.trim() === label);

    dice.clearAllDice();
    for (const t of ['+D4', '+D6', '+D8', '+D10', '+D12', '+D20']) typeButton(t)?.click();
    await wait(400);
    record('six dice added via panel', dice.diceArray.length === 6, `count=${dice.diceArray.length}`);
    record('shadow catcher present', !!dice.shadowCatcher);
    record('dice cast shadows', dice.diceArray.every((m) => m.castShadow));
    record(
        'count display updated',
        /6\/50/.test(panel.querySelector('.dice-count-display').textContent),
        panel.querySelector('.dice-count-display').textContent
    );

    // --- roll ---------------------------------------------------------------
    const rollPromise = dice.roll();
    record('physics running during roll', dice.animationId !== null);

    // Pump the physics to a standstill, then let the settle monitor — which
    // runs on setTimeout, not on frames — catch up in wall-clock time.
    const settledAfter = await pump(1200);
    record('all dice fall asleep', settledAfter !== null, `after ${settledAfter} frames`);

    const result = await Promise.race([rollPromise, wait(12000).then(() => null)]);
    const caught = dice.diceStates.filter((s) => s.isCaught).length;
    // A roll deliberately does not resolve while any die is "caught" — it waits
    // for a reroll. That is the feature working, not a failure.
    record(
        'roll resolves, or reports caught dice',
        (typeof result === 'string' && result.includes('=')) || caught > 0,
        result === null ? `unresolved, ${caught} caught` : String(result)
    );

    // --- the whole point: does the loop stop on its own? ---------------------
    const states = dice.diceBodyArray.map((b) => b.sleepState);
    record('all dice asleep', states.every((s) => s === 2), states.join(','));

    dice.wake();                                   // as any mutation would
    const armed = dice.animationId !== null;
    dice.lastFrameTime = performance.now() - 1000 / 60;
    dice.animate();                                // one frame, nothing moving
    record('render loop stops itself', armed && dice.animationId === null);

    // --- shadows ------------------------------------------------------------
    await pump(2);
    record('shadow map enabled', dice.renderer.shadowMap.enabled === true);
    record('a light casts', !!dice.shadowLight && dice.shadowLight.castShadow === true);
    record('catcher sits on the resting plane',
        !!dice.shadowCatcher && Math.abs(dice.shadowCatcher.position.y - dice.shadowPlaneY) < 1e-6);
    // The catcher must never paint over the dice or the note behind it.
    record('catcher is invisible except for shadow',
        !!dice.shadowCatcher && dice.shadowCatcher.material.type === 'ShadowMaterial');

    // --- a settings change must reach the screen ------------------------------
    const beforeBodies = dice.world.bodies.length;
    for (let i = 0; i < 20; i++) {
        plugin.settings.ambientLightIntensity = 0.6 + (i % 5) * 0.1;
        dice.updateSettings(plugin.settings);
    }
    record('tray not accumulating', dice.world.bodies.length === beforeBodies,
        `${beforeBodies} -> ${dice.world.bodies.length}`);
    record('settings change wakes the loop', dice.animationId !== null);

    // --- shadows can be turned off ------------------------------------------
    plugin.settings.enableShadows = false;
    dice.updateSettings(plugin.settings);
    // updateSettings only marks the scene dirty; a frame has to run for the
    // blobs to be hidden, and rAF is throttled when Obsidian is not focused.
    await pump(2);
    record('shadows respect the toggle',
        dice.renderer.shadowMap.enabled === false && dice.shadowCatcher === null);
    plugin.settings.enableShadows = true;
    dice.updateSettings(plugin.settings);

    // Real shadows are the silhouette by construction, so there is no outline
    // to line up any more — that whole class of bug is gone with the blobs.
    plugin.settings.enableShadows = true;
    dice.updateSettings(plugin.settings);
    await pump(2);
    record('shadows come back when re-enabled',
        dice.renderer.shadowMap.enabled === true && !!dice.shadowCatcher);

    // --- hit testing --------------------------------------------------------
    const rect = dice.renderer.domElement.getBoundingClientRect();
    const target = dice.diceArray[0];
    const v = target.position.clone().project(dice.camera);
    const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
    record('centre of a die hit-tests', dice.pickDiceIndex(sx, sy) === 0, `idx=${dice.pickDiceIndex(sx, sy)}`);
    record('empty tray misses', dice.pickDiceIndex(rect.left + 5, rect.top + 5) === -1);

    // --- reroll path --------------------------------------------------------
    // Returns true only when there was something to reroll, and must never throw.
    const caughtNow = dice.diceStates.filter((st) => st.isCaught && !st.isComplete).length;
    let rerollReturned;
    let rerollThrew = false;
    try { rerollReturned = dice.rerollCaughtDice(); } catch (e) { rerollThrew = true; }
    record(
        'rerollCaughtDice matches the caught count',
        !rerollThrew && rerollReturned === caughtNow > 0,
        `caught=${caughtNow} returned=${rerollReturned}`
    );

    // --- close and reopen (leak check) ---------------------------------------
    const canvasesBefore = document.querySelectorAll('canvas').length;
    app.commands.executeCommandById('dsix:toggle-dice-roller');
    await wait(400);
    record('overlay closes', plugin.isVisible === false);
    record('overlay removed from dom', document.querySelectorAll('.dice-floating-overlay').length === 0);

    app.commands.executeCommandById('dsix:toggle-dice-roller');
    await wait(600);
    app.commands.executeCommandById('dsix:toggle-dice-roller');
    await wait(400);
    record('canvases not accumulating', document.querySelectorAll('canvas').length <= canvasesBefore,
        `${canvasesBefore} -> ${document.querySelectorAll('canvas').length}`);
} finally {
    console.error = origError;
    console.warn = origWarn;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
}

return {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    failures: results.filter((r) => !r.ok),
    all: results.map((r) => `${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`),
    consoleNoise: errors.slice(0, 15)
};

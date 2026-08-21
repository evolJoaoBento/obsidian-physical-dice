/**
 * Instrumentation for the harness.
 *
 * The performance notes end with "every item was confirmed by instrumenting a
 * running build rather than by reading code and reasoning about it. If
 * something here does not reproduce, trust the instrument." This is that
 * instrument, made permanent.
 *
 * Counters are installed on the *prototypes* of THREE.WebGLRenderer and
 * CANNON.World, not on instances: D20Dice is rebuilt every time the overlay is
 * toggled, so instance patches would go stale after the first close.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

interface Counter {
    total: number;
    lastSecond: number;
    private_window: number[];
}

function newCounter(): Counter {
    return { total: 0, lastSecond: 0, private_window: [] };
}

const draws = newCounter();
const steps = newCounter();

function tick(counter: Counter, now: number): void {
    counter.total++;
    counter.private_window.push(now);
}

function trim(counter: Counter, now: number): void {
    const cutoff = now - 1000;
    while (counter.private_window.length && counter.private_window[0] < cutoff) {
        counter.private_window.shift();
    }
    counter.lastSecond = counter.private_window.length;
}

let installed = false;

const PATCHED = Symbol('harness-counted');

/**
 * THREE.WebGLRenderer assigns `render` inside its constructor, so it is an own
 * property of each instance and there is no prototype to patch — verified in
 * the harness, not assumed. Each renderer therefore has to be wrapped
 * individually, and a new one appears every time the overlay is reopened.
 * Cheap and idempotent, so probe() just calls this on whatever it finds.
 */
export function attachRenderer(renderer: any): void {
    if (!renderer || renderer[PATCHED]) return;
    renderer[PATCHED] = true;
    const originalRender = renderer.render.bind(renderer);
    renderer.render = (...args: unknown[]) => {
        tick(draws, performance.now());
        return originalRender(...args);
    };
}

export function installCounters(): void {
    if (installed) return;
    installed = true;

    // CANNON.World is a real class, so this one does live on the prototype.
    const worldProto = CANNON.World.prototype as any;
    const originalStep = worldProto.step;
    worldProto.step = function (...args: unknown[]) {
        tick(steps, performance.now());
        return originalStep.apply(this, args);
    };

    // Keep the rolling windows honest even when nothing is drawing — that is
    // precisely the state worth being able to observe.
    window.setInterval(() => {
        const now = performance.now();
        trim(draws, now);
        trim(steps, now);
    }, 250);
}

const SLEEP_STATE = ['AWAKE', 'SLEEPY', 'SLEEPING'];

export interface DiceProbe {
    index: number;
    type: string;
    position: { x: number; y: number; z: number };
    speed: number;
    sleepState: string;
    shadow: { visible: boolean; opacity: number; scale: number; y: number } | null;
}

export interface HarnessProbe {
    overlayOpen: boolean;
    /** null when the rAF loop has stopped, which is the point of the whole thing. */
    loopRunning: boolean;
    dragging: boolean;
    rolling: boolean;
    diceCount: number;
    drawsPerSecond: number;
    stepsPerSecond: number;
    totalDraws: number;
    totalSteps: number;
    worldBodies: number;
    sceneObjects: number;
    trayBodies: number;
    dice: DiceProbe[];
}

/**
 * Reads live state out of the plugin. Everything here reaches through `any`
 * into private fields on purpose: the harness is a test rig, and the
 * alternative is widening the plugin's public surface for no other reason.
 */
export function probe(plugin: any): HarnessProbe {
    const dice = plugin?.dice;

    const base: HarnessProbe = {
        overlayOpen: Boolean(plugin?.isVisible),
        loopRunning: false,
        dragging: false,
        rolling: false,
        diceCount: 0,
        drawsPerSecond: draws.lastSecond,
        stepsPerSecond: steps.lastSecond,
        totalDraws: draws.total,
        totalSteps: steps.total,
        worldBodies: 0,
        sceneObjects: 0,
        trayBodies: 0,
        dice: []
    };

    if (!dice) return base;

    attachRenderer(dice.renderer);

    base.loopRunning = dice.animationId !== null && dice.animationId !== undefined;
    base.dragging = Boolean(dice.isDragging);
    base.rolling = Boolean(dice.isRolling);
    base.diceCount = dice.diceArray?.length ?? 0;
    base.worldBodies = dice.world?.bodies?.length ?? 0;
    base.trayBodies = dice.trayBodies?.length ?? 0;

    let sceneObjects = 0;
    dice.scene?.traverse(() => sceneObjects++);
    base.sceneObjects = sceneObjects;

    for (let i = 0; i < base.diceCount; i++) {
        const mesh = dice.diceArray[i];
        const body = dice.diceBodyArray[i];
        const blob = dice.shadowArray?.[i];

        base.dice.push({
            index: i,
            type: dice.diceTypeArray?.[i] ?? '?',
            position: {
                x: +mesh.position.x.toFixed(2),
                y: +mesh.position.y.toFixed(2),
                z: +mesh.position.z.toFixed(2)
            },
            speed: +(body ? body.velocity.length() + body.angularVelocity.length() : 0).toFixed(3),
            sleepState: body ? SLEEP_STATE[body.sleepState] ?? String(body.sleepState) : '-',
            shadow: blob
                ? {
                      visible: blob.visible,
                      opacity: +blob.material.opacity.toFixed(3),
                      scale: +blob.scale.x.toFixed(2),
                      y: +blob.position.y.toFixed(2)
                  }
                : null
        });
    }

    return base;
}

export function resetCounters(): void {
    draws.total = 0;
    steps.total = 0;
    draws.private_window = [];
    steps.private_window = [];
}

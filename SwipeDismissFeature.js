// @ts-check
/** @import {SwipeDismissProps, FeatureSpawnContext} from './types/swipe-dismiss/types' */
import { assignFrom } from 'assign-gingerly/assignFrom.js';

/**
 * A custom element feature that adds swipe-to-dismiss gesture handling.
 *
 * The feature is intentionally decoupled from rendering: it computes the gesture
 * and reports progress / commit / cancel via callbacks. The host custom element
 * decides how to translate that into CSS or state changes.
 *
 * @implements {SwipeDismissProps}
 */
class SwipeDismissFeature {
    /** @type {WeakRef<Element>} */
    #hostRef;

    /** @type {AbortController | null} */
    #pointerDownAbort = null;

    /** @type {import('./types/assign-gingerly/types').FeatureConfig['customData'] | undefined} */
    #customData;

    /** @type {import('./types/swipe-dismiss/types').SwipeDismissProps['axis']} */
    axis = 'x';

    /** @type {import('./types/swipe-dismiss/types').SwipeDismissProps['direction']} */
    direction = 1;

    /** @type {number} */
    distanceThreshold = 0.4;

    /** @type {number} */
    velocityThreshold = 0.5;

    /** @type {Element | null} */
    #handle = null;

    /** @type {Element | null} */
    #panel = null;

    /** @type {((deltaPx: number, fraction: number) => void) | null} */
    onProgress = null;

    /** @type {(() => void) | null} */
    onCommit = null;

    /** @type {(() => void) | null} */
    onCancel = null;

    /** @type {import('./types/swipe-dismiss/types').AllProps['progressState']} */
    progressState = { deltaPx: 0, fraction: 0, translatePx: 0 };

    /**
     * WeakRef to the host custom element.
     * @returns {WeakRef<Element>}
     */
    get hostRef() {
        return this.#hostRef;
    }

    /**
     * The drag handle. Setting this (to a new element, or to null) aborts any
     * previously attached listener and, if non-null and the host is connected,
     * attaches a fresh one. No hydration happens until this is set.
     * @returns {Element | null}
     */
    get handle() {
        return this.#handle;
    }

    set handle(el) {
        this.#handle = el ?? null;
        this.#connect();
    }

    /**
     * The panel that visually follows the drag. Defaults to `handle` when left
     * `null`. Setting this re-hydrates the same way `handle` does.
     * @returns {Element | null}
     */
    get panel() {
        return this.#panel;
    }

    set panel(el) {
        this.#panel = el ?? null;
        this.#connect();
    }

    /**
     * @param {Element} hostElement
     * @param {FeatureSpawnContext} ctx
     * @param {Partial<SwipeDismissProps>} [initVals]
     */
    constructor(hostElement, ctx, initVals) {
        this.#hostRef = new WeakRef(hostElement);
        this.#customData = ctx?.injection?.customData;
        if (initVals) {
            Object.assign(this, initVals);
        }
        this.#connect();
    }

    /**
     * Call from the host's connectedCallback() (via callbackForwarding).
     */
    hostConnected() {
        this.#connect();
    }

    /**
     * Call from the host's disconnectedCallback() (via callbackForwarding).
     */
    hostDisconnected() {
        this.#disconnect();
    }

    /**
     * @returns {Element | null}
     */
    get #host() {
        return this.#hostRef.deref();
    }

    /**
     * Execute a declarative callback configuration via assign-gingerly.
     * @param {'onProgress' | 'onCommit' | 'onCancel'} key
     */
    #assignFrom(key) {
        const host = this.#host;
        if (!host) return;
        const pattern = this.#customData?.assign?.[key];
        if (!pattern) return;
        assignFrom(host, pattern, {
            ...this.#customData?.assignOptions,
            from: this,
        });
    }

    #connect() {
        this.#disconnect();

        const host = this.#host;
        if (!host || !host.isConnected) return;
        if (!this.#handle) return;

        this.#pointerDownAbort = new AbortController();
        this.#handle.addEventListener('pointerdown', this.#onPointerDown, {
            signal: this.#pointerDownAbort.signal,
        });
    }

    #disconnect() {
        this.#pointerDownAbort?.abort();
        this.#pointerDownAbort = null;
        this.#endDrag();
    }

    /**
     * Movement (px) along the axis, in the dismiss direction, required before a
     * pointerdown is treated as a drag. Below this a press is left alone so the
     * native `click` still reaches whatever was pressed (close buttons, links,
     * etc. inside the panel).
     * @type {number}
     */
    #slop = 8;

    /**
     * Current drag state.
     * @typedef {Object} DragState
     * @property {number} pointerId
     * @property {boolean} active - false until movement passes #slop; while
     *   false no pointer capture is held and no progress is reported
     * @property {number} start - start coordinate along the active axis
     * @property {number} startCross - start coordinate along the other axis
     * @property {number} startTime
     * @property {number} size - panel size along the active axis
     * @property {Element} handle
     */

    /** @type {DragState | null} */
    #dragState = null;

    /** @type {AbortController | null} */
    #dragAbort = null;

    /**
     * @param {PointerEvent} event
     */
    #onPointerDown = (event) => {
        const host = this.#host;
        if (!host || !host.isConnected) return;

        const handle = this.#handle;
        if (!handle) return;

        const panel = this.#panel ?? handle;

        const rect = panel.getBoundingClientRect();
        const size = this.axis === 'x' ? rect.width : rect.height;
        if (size === 0) return;

        this.#endDrag();

        // Record the press but do NOT capture the pointer or treat it as a drag
        // yet. Capturing on pointerdown would retarget the follow-up
        // pointerup/click to the panel, so a mouse click on a control inside the
        // panel (e.g. a close button) would never fire. Capture is deferred to
        // #onPointerMove, once movement passes #slop.
        this.#dragState = {
            pointerId: event.pointerId,
            active: false,
            start: this.axis === 'x' ? event.clientX : event.clientY,
            startCross: this.axis === 'x' ? event.clientY : event.clientX,
            startTime: performance.now(),
            size,
            handle,
        };

        this.#dragAbort = new AbortController();
        handle.addEventListener('pointermove', this.#onPointerMove, {
            signal: this.#dragAbort.signal,
        });
        handle.addEventListener('pointerup', this.#onPointerUp, {
            signal: this.#dragAbort.signal,
        });
        handle.addEventListener('pointercancel', this.#onPointerUp, {
            signal: this.#dragAbort.signal,
        });
    };

    /**
     * @param {PointerEvent} event
     */
    #onPointerMove = (event) => {
        const state = this.#dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const current = this.axis === 'x' ? event.clientX : event.clientY;

        if (!state.active) {
            const cross = (this.axis === 'x' ? event.clientY : event.clientX) - state.startCross;
            const along = this.#applyDirection(current - state.start);

            // Cross-axis movement wins first → this is a scroll, not a dismiss.
            // Bail out so the browser keeps the gesture (e.g. panel scrolling).
            if (Math.abs(cross) > this.#slop && Math.abs(cross) > Math.abs(along)) {
                this.#endDrag();
                return;
            }

            // Not enough movement in the dismiss direction yet — leave the
            // press alone (a click can still happen on pointerup).
            if (along <= this.#slop) return;

            // Threshold crossed: promote to a real drag. Capture now, and
            // re-baseline so progress starts from 0 with no visual jump.
            state.active = true;
            state.start = current;
            state.startCross = this.axis === 'x' ? event.clientY : event.clientX;
            state.startTime = performance.now();
            try {
                state.handle.setPointerCapture(state.pointerId);
            } catch {
                // Capture can throw if the pointer is already gone.
            }
        }

        const raw = current - state.start;
        const directed = this.#applyDirection(raw);
        const clamped = Math.min(Math.max(0, directed), state.size);
        const fraction = clamped / state.size;

        this.progressState = {
            deltaPx: clamped,
            fraction,
            translatePx: this.#directionSign() * clamped,
        };
        this.onProgress?.(clamped, fraction);
        this.#assignFrom('onProgress');
    };

    /**
     * @param {PointerEvent} event
     */
    #onPointerUp = (event) => {
        const state = this.#dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        // Released before the drag ever started (a click/tap): tear down quietly
        // and let the native click proceed. No commit/cancel callbacks.
        if (!state.active) {
            this.#endDrag();
            return;
        }

        const current = this.axis === 'x' ? event.clientX : event.clientY;
        const raw = current - state.start;
        const directed = this.#applyDirection(raw);
        const delta = Math.min(Math.max(0, directed), state.size);
        const elapsed = performance.now() - state.startTime;
        const velocity = elapsed > 0 ? delta / elapsed : 0;

        this.progressState = {
            deltaPx: delta,
            fraction: delta / state.size,
            translatePx: this.#directionSign() * delta,
        };

        this.#endDrag();

        const committed =
            delta > state.size * this.distanceThreshold ||
            velocity > this.velocityThreshold;

        if (committed) {
            this.onCommit?.();
            this.#assignFrom('onCommit');
        } else {
            this.onCancel?.();
            this.#assignFrom('onCancel');
        }
    };

    /**
     * Signed multiplier that maps the always-positive drag magnitude onto a
     * screen-space translation: -1 for a left/up drawer, +1 for right/down.
     * `'both'` has no single dismiss direction, so it falls back to +1.
     * @returns {number}
     */
    #directionSign() {
        return Number(this.direction) < 0 ? -1 : 1;
    }

    /**
     * Apply the configured direction to a raw delta.
     * @param {number} raw
     * @returns {number}
     */
    #applyDirection(raw) {
        if (this.direction === 'both') {
            return Math.abs(raw);
        }
        return raw * this.direction;
    }

    #endDrag() {
        if (this.#dragState) {
            if (this.#dragState.active) {
                try {
                    this.#dragState.handle.releasePointerCapture(this.#dragState.pointerId);
                } catch {
                    // Release may throw if the pointer is no longer valid.
                }
            }
            this.#dragState = null;
        }
        this.#dragAbort?.abort();
        this.#dragAbort = null;
    }
}

export { SwipeDismissFeature };

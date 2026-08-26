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
    progressState = { deltaPx: 0, fraction: 0 };

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
     * Current drag state.
     * @typedef {Object} DragState
     * @property {number} pointerId
     * @property {number} start - start coordinate along the active axis
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

        this.#dragState = {
            pointerId: event.pointerId,
            start: this.axis === 'x' ? event.clientX : event.clientY,
            startTime: performance.now(),
            size,
            handle,
        };

        handle.setPointerCapture(event.pointerId);

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
        const raw = current - state.start;
        const directed = this.#applyDirection(raw);
        const clamped = Math.min(Math.max(0, directed), state.size);
        const fraction = clamped / state.size;

        this.progressState = { deltaPx: clamped, fraction };
        this.onProgress?.(clamped, fraction);
        this.#assignFrom('onProgress');
    };

    /**
     * @param {PointerEvent} event
     */
    #onPointerUp = (event) => {
        const state = this.#dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const current = this.axis === 'x' ? event.clientX : event.clientY;
        const raw = current - state.start;
        const directed = this.#applyDirection(raw);
        const delta = Math.min(Math.max(0, directed), state.size);
        const elapsed = performance.now() - state.startTime;
        const velocity = elapsed > 0 ? delta / elapsed : 0;

        this.progressState = { deltaPx: delta, fraction: delta / state.size };

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
            try {
                this.#dragState.handle.releasePointerCapture(this.#dragState.pointerId);
            } catch {
                // Release may throw if the pointer is no longer valid.
            }
            this.#dragState = null;
        }
        this.#dragAbort?.abort();
        this.#dragAbort = null;
    }
}

export { SwipeDismissFeature };

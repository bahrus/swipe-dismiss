// @ts-check
/** @import {SwipeDismissProps, FeatureSpawnContext} from './types/swipe-dismiss/types' */

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

    /** @type {boolean} */
    #hasDisconnected = false;

    /** @type {import('./types/swipe-dismiss/types').SwipeDismissProps['axis']} */
    axis = 'x';

    /** @type {import('./types/swipe-dismiss/types').SwipeDismissProps['direction']} */
    direction = 1;

    /** @type {number} */
    distanceThreshold = 0.4;

    /** @type {number} */
    velocityThreshold = 0.5;

    /** @type {string | null} */
    handleSelector = null;

    /** @type {string | null} */
    panelSelector = null;

    /** @type {((deltaPx: number, fraction: number) => void) | null} */
    onProgress = null;

    /** @type {(() => void) | null} */
    onCommit = null;

    /** @type {(() => void) | null} */
    onCancel = null;

    /**
     * @param {Element} hostElement
     * @param {FeatureSpawnContext} ctx
     * @param {Partial<SwipeDismissProps>} [initVals]
     */
    constructor(hostElement, ctx, initVals) {
        this.#hostRef = new WeakRef(hostElement);
        if (initVals) {
            Object.assign(this, initVals);
        }
        // Features are spawned during the first connectedCallback, so the host
        // is connected here. Guard against future disconnect/reconnect cycles.
        if (hostElement.isConnected) {
            this.#connect();
        }
    }

    /**
     * Call from the host's connectedCallback() (via callbackForwarding).
     */
    hostConnected() {
        if (this.#hasDisconnected) {
            this.#hasDisconnected = false;
            this.#connect();
        }
    }

    /**
     * Call from the host's disconnectedCallback() (via callbackForwarding).
     */
    hostDisconnected() {
        this.#hasDisconnected = true;
        this.#disconnect();
    }

    /**
     * @returns {Element | null}
     */
    get #host() {
        return this.#hostRef.deref();
    }

    #connect() {
        const host = this.#host;
        if (!host) return;

        this.#disconnect();
        const handle = this.#resolveHandle(host);
        if (!handle) return;

        this.#pointerDownAbort = new AbortController();
        handle.addEventListener('pointerdown', this.#onPointerDown, {
            signal: this.#pointerDownAbort.signal,
        });
    }

    #disconnect() {
        this.#pointerDownAbort?.abort();
        this.#pointerDownAbort = null;
        this.#endDrag();
    }

    /**
     * @param {Element} host
     * @returns {Element | null}
     */
    #resolveHandle(host) {
        if (this.handleSelector) {
            return host.querySelector(this.handleSelector);
        }
        return host;
    }

    /**
     * @param {Element} handle
     * @returns {Element | null}
     */
    #resolvePanel(handle) {
        const host = this.#host;
        if (!host) return null;
        if (this.panelSelector) {
            return host.querySelector(this.panelSelector);
        }
        return handle;
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

        const handle = this.#resolveHandle(host);
        if (!handle) return;

        const panel = this.#resolvePanel(handle);
        if (!panel) return;

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
        const clamped = Math.max(0, directed);

        this.onProgress?.(clamped, clamped / state.size);
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
        const delta = Math.max(0, directed);
        const elapsed = performance.now() - state.startTime;
        const velocity = elapsed > 0 ? delta / elapsed : 0;

        this.#endDrag();

        const committed =
            delta > state.size * this.distanceThreshold ||
            velocity > this.velocityThreshold;

        if (committed) {
            this.onCommit?.();
        } else {
            this.onCancel?.();
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

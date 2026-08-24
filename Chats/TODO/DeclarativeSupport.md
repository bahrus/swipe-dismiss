# Declarative Support

## Background

I asked Kimi To Integrate the swipe-dismiss feature into the side-burger [HTML-first custom element](/types/NewHTMLFirstCustomElement.md).  The ideal of such HTML-first custom elements is zero custom imperative logic -- everything is configurable via JSON that declaratively defines how the HtML children interact.  The effort fell short (expand below)

<details>
    <summary>Kimi's implementation notes and shortfalls</summary>

dded swipe-dismiss support to the declarative ElementMaker configuration.

### Changes made

- `types/el-maker/types.d.ts` — added `swipeDismiss?: { spawn?: string, customData?: any, withAttrs?: AttrPatterns<any> }` to `ElMakerConfig.assignFeatures` so the config type-checks.
- `el-maker.mjs` — added a `swipeDismiss` feature entry with `withAttrs` for declarative configuration:
  - `swipe-dismiss-axis` → `axis`
  - `swipe-dismiss-direction` → `direction`
  - `swipe-dismiss-handle` → `handleSelector`
  - `swipe-dismiss-panel` → `panelSelector`
  - `swipe-dismiss-distance-threshold` → `distanceThreshold` (parsed as Number, default 0.4)
  - `swipe-dismiss-velocity-threshold` → `velocityThreshold` (parsed as Number, default 0.5)
- `root.html` — prepared the drawer for gesture handling:
  - Added `touch-action: none` to `.drawer`
  - Added a `.drawer[data-dragging]` rule to disable the transition while dragging
  - Added a `.drag-handle` element and part on the drawer edge with `touch-action: none`
  - Added mirrored right-side handle styling for `position="right"`
- `el-maker.json` — regenerated with `node el-maker.mjs`.

### What still needs to be wired for the swipe to actually dismiss the drawer

The `SwipeDismissFeature` in `node_modules/el-maker/swipe-dismiss/SwipeDismissFeature.js` is intentionally decoupled from rendering: it computes the gesture and calls `onProgress`, `onCommit`, and `onCancel` callbacks on the spawned feature instance. Those callbacks are what must:

1. Apply a visual translation during the drag (e.g. `drawer.style.transform = translateX(...)` or set a CSS custom property).
2. Set `open = false` when the gesture commits.
3. Reset the transform when the gesture is cancelled.

Because `el-maker.json` is JSON consumed by the `cede`/`precede` script, it cannot serialize function values. I do not see a declarative way in the current el-maker/roundabout config to register those three callbacks.

### Additional blocker: shadow-DOM query scope

`SwipeDismissFeature.#resolveHandle(host)` and `#resolvePanel(handle)` use `host.querySelector(this.handleSelector)` / `host.querySelector(this.panelSelector)`. `querySelector` does not cross shadow boundaries, so selectors like `[part="drawer"]` or `[name="drawer"]` inside the `side-burger` shadow root will not match from the feature.

For a side drawer whose panel lives in the shadow DOM, the feature either needs to query the shadow root (`host.shadowRoot.querySelector(...)`) or the panel/handle must be reachable from the light DOM.

### Clarifying question

What is the intended way to wire `SwipeDismissFeature`'s `onProgress`/`onCommit`/`onCancel` callbacks in a fully declarative, JSON-driven side-burger config? Two possibilities come to mind:

1. **Event-dispatching version:** Enhance `SwipeDismissFeature` to dispatch events (e.g. `swipe-progress`, `swipe-commit`, `swipe-cancel`) on the host, then wire `roundabout` compacts to listen for those events.
2. **Small bridge feature:** Add a local side-burger feature that wraps `SwipeDismissFeature`, queries the shadow DOM, sets the callbacks, and updates `open`/CSS directly.

Which direction should I take?

</details>

## Bruce's Ask

So I *think* what would be able to carry the day is if, instead of (or in addition) to defining imperative callbacks for onProgress, onCommit, onCancel, we can configure:

```JS
customElements.assignFeatures(MyDrawer, {
    swipeDismiss: {
        spawn: SwipeDismissFeature,
        withAttrs: {
            base: 'swipe-dismiss',
            axis: '${base}-axis',
            direction: '${base}-direction',
            distanceThreshold: '${base}-distance-threshold',
            velocityThreshold: '${base}-velocity-threshold',
            _distanceThreshold: { instanceOf: 'Number' },
            _velocityThreshold: { instanceOf: 'Number' }
        },
        customData: {
            assign: {
                onProgress: {
                    '?.shadowRoot?.panel?.style?.transform =>': {
                        do: 'builtIns.join',
                        get: {
                            value: ['translateX(', '?.progressState?.deltaPx', 'px)']
                        }
                    }
                },
                onCommit: {
                    '?.open': false,
                },
                onCancel: {
                    '?.shadowRoot?.panel?.style?.transform': ''
                }
            },
            assignOptions: { //optional
                ...
            }

        }
    }
});
```

Type AllProps would be extended:

```JS
/**
 * Internal state of the feature.
 */
export interface AllProps extends SwipeDismissProps {
    /** WeakRef to the host custom element. */
    hostRef: WeakRef<Element>;
    progressState: {
        deltaPx: number,
        fraction: number
    }
}
```

Prior to performing the assignOnProgress, the progressState swipe-progress feature  would be updated with the current values passed to onProgress. 

This means this package would need to add a dependency to [assign-gingerly](https://github.com/bahrus/assign-gingerly) and use the assignFrom function:

```JS
//onProgress assignment
assignFrom(this.#hostRef.deref(), customData.assign.onProgress, customData.{...assignOptions, from: this})
```

Does this make sense?

If so, please implement and update the README.md documentation, and add your implementation notes below.  If not, please ask for clarification below or honestly point out what I'm missing.

## Implementation Notes

Implemented declarative callback support in `SwipeDismissFeature.js`.

### What changed

- `SwipeDismissFeature.js`
  - Imports `assignFrom` from `assign-gingerly/assignFrom.js`.
  - Stores `ctx.injection.customData` on construction so the declarative config is available during the gesture.
  - Adds a public `hostRef` getter and a public `progressState` property (`{ deltaPx, fraction }`).
  - Updates `progressState` on every `pointermove` and before `pointerup` decides commit/cancel.
  - Calls imperative `onProgress` / `onCommit` / `onCancel` first, then runs the matching `customData.assign.*` pattern through `assignFrom` with `from: this`.
  - `customData.assignOptions` is spread into the `assignFrom` options, so consumers can pass `withMethods`, `aka`, `substitutions`, etc.
- `types/swipe-dismiss/types.d.ts`
  - Extended `AllProps` with `hostRef: WeakRef<Element>` and `progressState: { deltaPx: number, fraction: number }`.
- `package.json` / `package-lock.json`
  - Moved `assign-gingerly` from `devDependencies` to `dependencies` because `SwipeDismissFeature.js` now imports it at runtime.
- `README.md`
  - Added a **Declarative callbacks** section with the `customData.assign` pattern.
  - Added `hostRef` and `progressState` to the API table.

### How the declarative callbacks work

For each callback phase, `SwipeDismissFeature` first runs the imperative callback if present, then calls:

```js
assignFrom(host, this.#customData.assign.onProgress, {
  ...this.#customData.assignOptions,
  from: this,
});
```

Because `from` is the feature instance, RHS paths like `?.progressState.deltaPx` resolve to the live drag state. The target is the host element, so LHS paths like `?.open` assign directly to the custom element.

### Not addressed

The separate shadow-DOM query-scope blocker noted above is not changed by this work. `handleSelector` / `panelSelector` still use `host.querySelector`, which does not cross shadow boundaries. Consumers using `customData.assign` can target shadow DOM nodes via `assign-gingerly` paths (e.g. `?.shadowRoot?.querySelector(...)` when `withMethods` / `aka` is configured) instead of relying on the feature's selectors.
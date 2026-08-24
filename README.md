# swipe-dismiss

A custom element feature that adds swipe-to-dismiss gesture handling to a custom element. It tracks pointer drag distance and velocity along one axis and tells the host whether to commit the dismiss action or snap back.

The feature intentionally does not touch rendering. It computes the gesture and reports `onProgress`, `onCommit`, and `onCancel`; the host element decides how to translate those callbacks into CSS transforms, state changes, or dialog close calls.

A future enhancement (`be-swipe-dismiss`) is planned for applying the same behavior to third-party markup via attributes.

## Usage

```javascript
import 'assign-gingerly/assignFeatures.js';
import { SwipeDismissFeature } from 'swipe-dismiss/SwipeDismissFeature.js';

class MyDrawer extends HTMLElement {
    static supportedFeatures = {
        swipeDismiss: {
            fallbackSpawn: SwipeDismissFeature,
            callbackForwarding: ['connectedCallback', 'disconnectedCallback']
        }
    };
}

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
        }
    }
});

customElements.define('my-drawer', MyDrawer);
```

In the host element, attach the callbacks after the feature is spawned and apply the visual translation in `onProgress`:

```javascript
const drawer = document.querySelector('my-drawer');
const panel = drawer.querySelector('[part="panel"]');

drawer.swipeDismiss.onProgress = (deltaPx, fraction) => {
    panel.style.transform = `translateX(${deltaPx}px)`;
};

drawer.swipeDismiss.onCommit = () => {
    drawer.removeAttribute('open');
};

drawer.swipeDismiss.onCancel = () => {
    panel.style.transform = '';
};
```

## HTML configuration

With the `withAttrs` pattern above, the host element can be configured declaratively:

```html
<my-drawer swipe-dismiss-axis="x"
           swipe-dismiss-direction="1"
           swipe-dismiss-distance-threshold="0.3"
           swipe-dismiss-velocity-threshold="0.5">
    <div part="panel">Drawer content</div>
</my-drawer>
```

## Declarative callbacks

Instead of wiring `onProgress`, `onCommit`, and `onCancel` imperatively, you can declare them via `assign-gingerly` patterns inside the feature configuration's `customData.assign`. This keeps the host element JSON-driven and avoids imperative callbacks.

The `assignFrom` source is the spawned `SwipeDismissFeature` instance, so paths like `?.progressState.deltaPx` resolve to the current gesture state. The target is the host element, so paths like `?.open` resolve against the custom element.

```javascript
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
                    '?.shadowRoot?.querySelector?.panel?.style?.transform =>': {
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
                    '?.shadowRoot?.querySelector?.panel?.style?.transform': ''
                }
            },
            assignOptions: {
                // optional additional assignFrom options
                withMethods: ['querySelector']
            }
        }
    }
});
```

Before the declarative `onProgress` assignment runs, the feature updates `progressState` with the current `deltaPx` and `fraction`. Imperative callbacks are still supported and run before the declarative ones.

## API

The feature exposes these configurable properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `axis` | `'x' \| 'y'` | `'x'` | Axis along which the dismiss gesture is measured. |
| `direction` | `1 \| -1 \| 'both'` | `1` | Direction that counts toward dismissal. `1` = right/down, `-1` = left/up, `'both'` = either direction (useful for toasts/snackbars). |
| `distanceThreshold` | `number` | `0.4` | Fraction of the panel size that must be dragged to trigger commit. |
| `velocityThreshold` | `number` | `0.5` | Velocity threshold in px/ms. A fast flick commits even if distance is below the threshold. |
| `handleSelector` | `string \| null` | `null` | CSS selector for the drag handle. Defaults to the host element. |
| `panelSelector` | `string \| null` | `null` | CSS selector for the panel that visually follows the drag. Defaults to the handle. |
| `onProgress` | `(deltaPx: number, fraction: number) => void` | `null` | Called on every pointer move with the current delta and the fraction of the panel size. |
| `onCommit` | `() => void` | `null` | Called when the gesture crosses the commit threshold. |
| `onCancel` | `() => void` | `null` | Called when the gesture is released before the commit threshold. |
| `hostRef` | `WeakRef<Element>` | — | WeakRef to the host custom element. Useful for declarative paths. |
| `progressState` | `{ deltaPx: number, fraction: number }` | `{ deltaPx: 0, fraction: 0 }` | Current drag state. Updated before each `onProgress` callback and declarative assignment. |

## Important CSS note

The drag handle should disable native touch gestures so pointer events are not stolen by the browser:

```css
[part="panel"], .drag-handle {
    touch-action: none;
}
```

If the panel content itself needs to scroll, scope `touch-action: none` to the handle only and leave the content area scrollable.

## Use cases

- **Drawers / side panels** — horizontal swipe to close.
- **Bottom sheets** — vertical swipe down (`axis: 'y'`, `direction: 1`).
- **Toasts / snackbars** — horizontal swipe in either direction (`direction: 'both'`).
- **Swipe-to-delete list items** — same gesture math, different `onCommit` action.

## Viewing Demos Locally

1. Install git
2. Fork/clone this repo
3. Install node.js
4. Open a command window in the repo folder
5. `git submodule add https://github.com/bahrus/types.git types`
6. `git submodule update --init --recursive`
7. `npm install`
8. `npm run serve`
9. Open http://localhost:8000/tests/test1.html in a modern browser

## Running Tests

```
> npm run test
```

The manual test page is at `tests/test1.html`. Programmatic Playwright specs can be added alongside it.

## License

MIT

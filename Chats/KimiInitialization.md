# Planning

---

## Bruce's Ask

I only have 4% quota remaining for this week, renewing in two days.  I just wanted to get your hot take on:

1.  The feasibility
2.  The usefulness

of implementing both a new [Element Enhancement](../types/NewEnhancementInstructions.md) as well as a new [Custom Element Feature](../types/NewCustomElementFeature.md) as described in the README -- for a [swipe-dismiss behavior](/Chats/Claude.md).

Could the same class be used for both, just different configuration artifacts?

After providing your thoughts on that, if time permits, please take a look at [Claude's Take](/Chats/Claude.md) on the code details.  Is anything missing?  Does Claude's guidance seem sound?

The implementation will begin when the new week begins.

Please add your thoughts below.

---

## Kimi's Take

### 1. Feasibility — yes, with one core class and two thin integration wrappers

`SwipeDismissController` is a good shape for the shared engine.  It is intentionally not a custom element or an enhancement — it is just pointer-state math plus distance/velocity threshold logic.  That makes it straightforward to wrap in both forms:

| Layer | What it owns | What it delegates to the shared controller |
|---|---|---|
| **Enhancement** (`be-swipe-dismiss` / `do-swipe-dismiss`) | Attribute parsing, finding the target element, mounting via `mount-observer`/`be-hive`, `roundabout` actions | `onProgress`, `onCommit`, `onCancel` callbacks |
| **Custom Element Feature** | `assignFeatures` registration, `callbackForwarding` for `connectedCallback`/`disconnectedCallback`, lazy getter spawn | Same callbacks, same axis/direction/threshold config |

The only real divergence is *when* the gesture can start:

- In the **enhancement** case the target element is already in the DOM; the controller is constructed in `hydrate` and can attach listeners immediately.
- In the **feature** case the host custom element may be upgraded before insertion, so you need `callbackForwarding: ['connectedCallback', 'disconnectedCallback']` and the `#hasDisconnected` guard pattern from the feature docs.  `getBoundingClientRect()` must not be called until the element is actually connected.

If the controller keeps host references as `WeakRef` and cleans up listeners in a `hostDisconnected()` / `disconnect()` method, both wrappers can reuse the same code without leaking.

### 2. Usefulness — high, and broader than drawers

Claude's list covers the main ones.  I would prioritize:

1. **Drawers / side panels** — horizontal swipe to close (the README's target).
2. **Bottom sheets / modals** — vertical swipe down.
3. **Toasts / snackbars** — horizontal swipe in *either* direction to dismiss.  The current controller only supports one signed direction, so this would need a small API extension (`direction: 'both'` or `allowBoth: true`) to avoid duplicating the class.
4. **Swipe-to-delete / archive list items** — same math, different `onCommit`.

For a first pass I would scope it to the directional-dismiss cases (drawer, sheet, toast, list item) and *not* try to cover carousels or pull-to-refresh, as Claude notes.

### 3. Assessment of Claude's guidance

It is mostly sound.  A few things I would add or tighten:

- **Accessibility.**  Swipe-to-dismiss is a gesture-only affordance.  You should also expose a keyboard-dismiss path (e.g. `Escape` for panels, a visible close button).  If this is a custom element feature, make sure `aria-modal`, `role="dialog"`, and focus trapping are handled by the host, not assumed.
- **Reduced motion.**  Respect `prefers-reduced-motion` in the snap-back / commit animations.  The controller hands you the decision point; the wrapper should decide whether to animate or just toggle state instantly.
- **`touch-action: none` should be scoped to the handle, not the whole panel**, whenever the panel content can scroll.  In the enhancement case this matters a lot because you are applying behavior to third-party markup.
- **Scroll competition / nested scrollers.**  If the content is vertically scrollable, a horizontal swipe should still work, but a vertically-scrolling drawer on a horizontally-scrolling page needs care.  Pointer Events with `touch-action` are the right primitive; just don't blanket-disable scrolling on the whole element.
- **`<dialog>` comment is accurate.**  Native `<dialog>` gives you focus management, top-layer, and Escape; it does *not* give you swipe.  The two compose, so a custom element feature could wrap a `<dialog>` and add the controller to the dialog element itself.
- **Bidirectional swipe for toasts.**  The current `direction` number design assumes a single sign.  If toast dismissal is in scope, plan for a two-direction mode so the API does not have to change later.

### 4. Practical starting point

I would start with the **custom element feature** first, because the lifecycle is simpler and the test harness in the feature docs is more direct.  Once the controller works there, wrap it as an **enhancement** by translating attribute config into the same controller options.  The generated `emc.json` would look something like:

```json
{
    "enhConfig": {
        "enhKey": "SwipeDismiss",
        "spawn": "swipe-dismiss/swipe-dismiss.js",
        "withAttrs": {
            "base": "swipe-dismiss",
            "axis": "${base}-axis",
            "direction": "${base}-direction",
            "distanceThreshold": "${base}-distance-threshold",
            "velocityThreshold": "${base}-velocity-threshold"
        }
    }
}
```

The feature registration would be similar but declared on the host element via `assignFeatures` and `withAttrs`.

### 5. Risk: the same class may need two personalities

The core math is identical, but the *configuration* integration artifacts are genuinely different:

- Enhancement config lives in `emc.mjs` and is consumed via `ctx.emc` / `roundabout`.
- Feature config lives in `assignFeatures(..., { swipeDismiss: { withAttrs: ..., spawn: ... } })`.

You can ship one `swipe-dismiss/SwipeDismissController.js` and two thin entry points:
- `swipe-dismiss/be-swipe-dismiss.js` — enhancement wrapper
- `swipe-dismiss/swipe-dismiss-feature.js` — feature wrapper

That avoids duplicating the gesture logic while keeping each integration idiomatic to its own mechanism.

---

## Bruce's Response I

Let's go with your suggestion to develop the custom element feature first.  This is convenient because I have a custom element that needs this feature right away.

I prefer we call it SwipeDismissFeature rather than controller.

If you have enough to go, please implement it and add the implementation notes below.  If not, please continue to discuss what is still needed below.
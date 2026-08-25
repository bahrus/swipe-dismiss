# Pullback From Searching Host

## Bruce's Ask

The [swipe-dismiss](../../README.md) custom element feature took a wrong turn in [assuming](../../SwipeDismissFeature.js):

1.  A handleSelector was somehow set externally, and if not set, assumes one.
2.  A panelSelector  was somehow set externally, and if not set, assumes one.

Neither of these are documented in the README.md, nor typed anywhere, and all the guesswork (shadow DOM, no shadow DOM, etc) is just wrong.

Instead, a type should be added to types/swipe-dismiss/types.d.ts that documents what users of the feature are expected to pass in -- handle, panel, both of type Element.

Only when both of these are passed in (I think) does it make any sense to start hydrating  -- adding event handlers that are triggered by dragging on the panel, etc.

And this should be well documented in the instructions.

Before implementing this change, please add your thoughts below of any questions / concerns / feedback / clarifications needed, to make sure we are on the same page.

## Claude

Agreed on the diagnosis. Looking at `#resolveHandle`/`#resolvePanel` in [SwipeDismissFeature.js](../../SwipeDismissFeature.js#L148-L170), the current code does `host.querySelector(sel) ?? host.shadowRoot?.querySelector(sel) ?? null` — trying light DOM, then guessing at shadow DOM, with no way for the feature to actually know which one the host uses. This exact gap was flagged and left unresolved back in [DeclarativeSupport.md](../DeclarativeSupport.md#L39-L43) ("Additional blocker: shadow-DOM query scope") — so this TODO is closing that loop, not just a style preference. Removing the selectors entirely and requiring real `Element` references is the right fix: it makes the feature agnostic to where the handle/panel actually live, and it's a floor cleaner than trying to add more shadow-DOM-aware guessing.

Proposed shape, to confirm before I touch code:

**Types** (`types/swipe-dismiss/types.d.ts`) — replace in `SwipeDismissProps`:
```ts
handleSelector: string | null;
panelSelector: string | null;
```
with:
```ts
/** The drag handle. Hydration (event listeners) only starts once both handle and panel are set. */
handle: Element | null;
/** The panel that visually follows the drag. */
panel: Element | null;
```

**Feature impl** — `#connect()` resolves nothing anymore; it just checks `this.handle && this.panel` and attaches `pointerdown` on `this.handle` if both are present. `#onPointerDown` uses `this.handle`/`this.panel` directly instead of re-resolving via selector on every drag.

That part seems unambiguous. Four things I want to check before implementing:

**1. Is "both explicitly set" a hard requirement, or does `panel` still default to `handle`?**
Today's README documents `panelSelector` defaulting to `handleSelector` (drag the whole handle as the panel). Your note says "only when both of these are passed in... does it make sense to start hydrating," which reads to me as: *no more implicit defaulting* — the consumer must pass both, even if they're the same element (e.g. `{ handle: panelEl, panel: panelEl }`). I'll implement it that way (no defaulting) unless you'd rather keep `panel` optional-defaults-to-`handle`, since that one default isn't "guesswork" the same way shadow-DOM sniffing was — it's just a convenience.

**2. This makes the feature JS-only to configure (no more pure-HTML-attribute path).**
Attributes (`withAttrs`) can only parse strings/numbers/booleans off the DOM — there's no way to get a live `Element` reference out of an HTML attribute string without going back to selector-based querying, which is the thing we're removing. So the README's current "HTML configuration" section (`swipe-dismiss-handle=".handle"` etc.) has no equivalent anymore. Consumers will need to do something like:
```js
const drawer = document.querySelector('my-drawer');
drawer.swipeDismiss = { handle: handleEl, panel: panelEl }; // before connectedCallback fires
```
relying on the own-property-shadow capture that `assign-gingerly`'s `installFeatureGetter` already supports (set before the element upgrades/connects, and it's captured as `initVals`). I think this is an acceptable, even correct, trade-off given what you're asking for — just flagging it as a real behavior change (declarative HTML-attribute config for handle/panel goes away entirely) so it's a deliberate choice, not a side effect.

**3. Should `handle`/`panel` be reactive after spawn?**
Right now `#connect()` only runs once (construction, or on reconnect after a disconnect). If a consumer sets `feature.handle = x` and `feature.panel = y` *after* the feature is already spawned (a pattern the README already shows for `onProgress`/`onCommit`/`onCancel`), nothing would currently react to that. Given your framing — "only when both are passed in does it make sense to start hydrating" — I read this as wanting real reactivity: turn `handle`/`panel` into accessors that call `#connect()` once both are non-null (and `#disconnect()` if either is cleared). Planning to implement it that way unless you intended "passed in" to mean only via constructor `initVals`/attributes-at-spawn-time.

**4. Silent no-op vs. warning when only one (or neither) is set?**
If hydration just doesn't start until both are present, should a partially-configured feature (only `handle` set) stay silent, or is a `console.warn` useful during development? I'd lean silent by default — a feature with `handle`/`panel` still `null` just isn't hydrated yet, not misconfigured — but wanted to check since the current code has several leftover `console.log` debug lines (pointerdown/move/up tracing) that look like debugging cruft rather than intentional API. I'd plan to strip those while in this file, unless you want them kept.

If all of that matches your intent, I'll:
- Update `types/swipe-dismiss/types.d.ts`
- Update `SwipeDismissFeature.js` (remove selector resolution, add `handle`/`panel` accessors gating connect/disconnect, drop debug `console.log`s)
- Rewrite the relevant README sections (Usage, HTML configuration → replaced with a "JS configuration" example, API table)
- Update `tests/test1.html`'s "Test 3: Separate handle, bidirectional" case to assign real elements instead of `swipe-dismiss-handle`/`swipe-dismiss-panel` attributes, and update `tests/swipe.spec.js` only if the console assertions need to change

Let me know on the four points above (or just say "go with your recommendations") and I'll implement.

## Bruce's Response

> **1. Is "both explicitly set" a hard requirement, or does `panel` still default to `handle`?**

The latter sounds better.

>  **2. This makes the feature JS-only to configure (no more pure-HTML-attribute path).**

It can be passed declaratively from the web component, using [assign-gingerly](https://github.com/bahrus/assign-gingerly), which is how I plan to do it, but that's of little concern to swipe-dismiss.


**3. Should `handle`/`panel` be reactive after spawn?**

The single handle (and/or panel) can be passed in, causing a hydration, then passed again with a different element, in which case abort the previous event handlers and attach a new event handler on the new element, so reactive is what I think you are calling it.

**4. Silent no-op vs. warning when neither is set?**

It should sit there silently in waiting to be helpful when the container needs it to be.

If things are clear enough to implement, please proceed, and add implementation notes to this git-commitable chat.  If not, please continue the clarifying discussion.

## Implementation Notes

Implemented per your four answers.

### What changed

- **`types/swipe-dismiss/types.d.ts`** — `SwipeDismissProps` now has `handle: Element | null` and `panel: Element | null`, replacing `handleSelector`/`panelSelector`. Note: this file lives in the `types` git submodule (`bahrus/types`), so this edit needs its own commit/push inside `types/` separate from the `swipe-dismiss` repo commit — I haven't committed anything, just edited working trees.
- **`SwipeDismissFeature.js`**
  - `handle`/`panel` are now accessor properties (backed by `#handle`/`#panel` private fields), not plain data fields. `#resolveHandle`/`#resolvePanel` (the `querySelector`/`shadowRoot?.querySelector` guessing) are gone entirely.
  - Setting `handle` or `panel` — at any time, via `initVals`/`Object.assign` at construction or by direct assignment later — calls `#connect()`, which always tears down the previous `pointerdown` listener first (`#disconnect()`), then re-attaches it to the current `this.#handle` only if the host is connected and `#handle` is non-null. `panel` has no independent listener; it's only read (as `this.#panel ?? handle`) when a drag actually starts.
  - This also simplified the connect/disconnect lifecycle: the old `#hasDisconnected` bookkeeping is gone — `#connect()` now checks `host.isConnected` itself, so `hostConnected()`/`hostDisconnected()` just call `#connect()`/`#disconnect()` unconditionally.
  - Removed all the leftover `console.log` debug tracing in `#onPointerDown`/`#onPointerMove`/`#onPointerUp`.
- **`README.md`** — replaced "HTML configuration" with a new "Wiring up `handle` and `panel`" section: explains the feature is inert until `handle` is set, that `panel` defaults to `handle`, that both are reactive (re-assigning tears down and re-attaches), and that there's intentionally no attribute-based path since `Element` values can't come from HTML attributes — declarative wiring, if wanted, is the host's concern (e.g. via `assign-gingerly`), not this package's. Updated the API table accordingly.
- **`tests/test1.html`**
  - Removed `handleSelector: '${base}-handle'` / `panelSelector: '${base}-panel'` from the `withAttrs` config and the `swipe-dismiss-handle`/`swipe-dismiss-panel` attributes from the `test-swipe-handle` markup.
  - Added a **Test 0** that dispatches a full drag sequence *before* `handle` is set and asserts nothing happens (`committed === null`) — this is the "sits there silently in waiting" behavior, and it wasn't covered by a test before.
  - `defaultEl`'s feature now gets `feature.handle = drawer` explicitly before Test 1/2 (previously `handle` defaulted to the host element implicitly).
  - `handleEl`'s feature (Test 3) now gets `hFeature.handle = handle; hFeature.panel = panel;` explicitly instead of relying on selector attributes.
  - `declarativeEl`'s feature (Test 4) now gets `declarativeEl.swipeDismiss.handle = declarativeDrawer` explicitly, for the same reason.

### A bug this incidentally fixed

Test 1's fraction assertion (`lastFraction === 100 / 300`) was actually failing before this change — I verified by stashing my edits and running the page standalone. With the old default (`panelSelector` unset → panel resolves to the *host custom element* itself, not the `.drawer` div), `panel.getBoundingClientRect().width` was **not** 300px, because an unstyled custom-element host wrapping a block child doesn't reliably take on that child's width. So `lastFraction` came out as `~0.079` instead of `~0.33`. Requiring an explicit `handle` (now set to `drawer` directly) fixes this by construction — one concrete example of why the implicit "defaults to host" guesswork was actually harmful, not just imprecise.

### Pre-existing bugs found, not fixed (out of scope for this TODO)

Since `tests/swipe.spec.js` only asserts that the console eventually contains `'All SwipeDismissFeature tests passed!'` — and `console.assert` doesn't throw on failure — several `console.assert` failures inside `test1.html` were silently passing CI already, unrelated to handle/panel. I confirmed both predate this change (same failures with `git stash` reverting to the original files):

1. **Test 2** ("drag under threshold cancels") actually commits instead of cancelling. The 20px drag is under the 90px distance threshold, but `velocity = delta / elapsed` exceeds `velocityThreshold: 0.5` because the test's `sleep(10)` calls don't give enough elapsed time for a 20px drag to stay under 0.5 px/ms — this is a test-timing bug, not a feature bug.
2. **Test 4** ("declarative callbacks") — `declarativeEl.dataset.swipeDelta`/`swipeFraction`/`swipeCancelled` all come back `undefined`, meaning the `customData.assign` declarative wiring in that test isn't actually landing on `dataset`. Didn't dig into why (assign-gingerly path resolution, most likely) since it's unrelated to this TODO.

Left both alone since they're pre-existing and out of scope — flagging in case you want a separate follow-up to tighten `swipe.spec.js` (e.g. failing the test on any `console.assert` failure text) and fix these two.

### Verified

`npm run test` passes. Also ran `test1.html` manually (headless Chromium via a throwaway script) with full console capture to check every individual `console.assert`, not just the final summary line — confirmed no *new* failures beyond the two pre-existing ones above, and confirmed Test 0 (the new inert-until-hydrated behavior) passes.




# Focus Dealer

A Super Productivity plugin that deals you **one task a day** — the night before, so it can incubate.

Most task systems assume your work has deadlines. Most of it doesn't. The dealer therefore weighs, in order:

1. **Deadline pressure** — a due date inside the window outranks everything.
2. **Staleness** — a task untouched past a threshold (default ~10 days) pulls harder the longer it waits.
3. **Readiness** — priority tags and already-moving tasks nudge up.

Guardrails: subtasks, routines (repeat-config tasks), archived projects, and tasks tagged DEFER / BLOCKED / DELEGATED are never dealt. A project dealt the maximum consecutive days in a row (default 2) rests — unless a hard deadline in it demands otherwise. One day a week can be a **light day** (your pick, or none) when the dealer prefers warm, already-moving tasks over heavy ones. And every so often it deals a **wildcat**: any eligible task, at random.

**You curate the deck.** Any project can be exempted from dealing, entirely, in the settings. Swapping a dealt card is always free — a swap is data, not failure.

The dealer only *reads* your tasks. Its settings and deal history live in the plugin's own synced data. Nothing is sent anywhere (`dataSharing: []`).

## Install

Settings → Plugins → Choose Plugin File → `focus-dealer.zip`. Then open it from the header button ("Focus Card") or the plugins menu.

## Known limitation

Super Productivity's PluginAPI does not expose Planner data, so the dealer cannot see tasks you have already planned for a day and may occasionally deal one of them. Swap it — that's what swaps are for. If the API ever exposes the planner, this is the first fix.

## Development

- `src/engine.js` — the dealing engine. Pure functions, no PluginAPI calls. This exact file is inlined into the plugin and exercised by the validation harness.
- `src/index.html` — the iframe UI (engine inlined at build time).
- `plugin/` — manifest, host-side `plugin.js`, icon.
- `scripts/pack.mjs` — builds `dist/focus-dealer.zip` (flat, manifest at top level) and prints its SHA-256.
- `scripts/validate.mjs` — runs the engine against a real sync-data snapshot (`SP_SNAPSHOT` env var) and prints what it would deal.

Requires Node 20+. No runtime dependencies. For editor autocomplete of the PluginAPI in VS Code, run `npm install` once (it only fetches the type definitions as a devDependency).

## License

Free. Take it, fork it, make it yours — that's the point.

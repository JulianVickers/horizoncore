# HorizonCore

A Super Productivity plugin that deals you **one task a day** — the night before, so it can incubate.

Most task systems assume your work has deadlines. Most of it doesn't. The dealer therefore weighs, in order:

1. **Deadline pressure** — a due date inside the window outranks everything.
2. **Staleness** — a task untouched past a threshold (default ~10 days) pulls harder the longer it waits.
3. **Readiness** — priority tags and already-moving tasks nudge up.

Guardrails: subtasks, routines (repeat-config tasks), archived projects, and tasks tagged DEFER / BLOCKED / DELEGATED are never dealt. A project dealt the maximum consecutive days in a row (default 2) rests — unless a hard deadline in it demands otherwise. One day a week can be a **light day** (your pick, or none) when the dealer prefers warm, already-moving tasks over heavy ones. And every so often it deals a **wildcat**: any eligible task, at random.

**You curate the deck.** Any project can be exempted from dealing, entirely, in the settings. Swapping a dealt card is always free — a swap is data, not failure.

## The timeline

Above the settings, below the cards: the board. One strip per project that carries dated open tasks, sorted by days remaining. Every dated task is a milestone dot; the strip ends at the furthest one. A project whose dates come from a repeating task is a *tracked series* — its strip runs to the horizon (default 6 months, adjustable) with a torn edge, and sorts by its next occurrence. Projects with no dated tasks are not on the board at all — they belong to the dealer, not the timeline. Want a project on the board? Give one of its tasks a date.

The dealer only *reads* your tasks. Its settings and deal history live in the plugin's own synced data. Nothing is sent anywhere (`dataSharing: []`).

## Install

Settings → Plugins → Choose Plugin File → `horizoncore.zip`. Then open it from the header button ("Focus Card") or the plugins menu.

## Known limitation

Super Productivity's PluginAPI does not expose Planner data, so the dealer cannot see tasks you have already planned for a day and may occasionally deal one of them. Swap it — that's what swaps are for. If the API ever exposes the planner, this is the first fix.

## Development

One product, one shared brain, several shells:

- `core/engine.js` — the engine: dealing + timeline model. Pure functions, no host calls. **The single source of truth** — every shell consumes this file, none forks it. It is inlined into the SP plugin at pack time and exercised directly by the validation harness.
- `plugin-sp/` — the Super Productivity plugin (v0.2.0, working today): `manifest.json`, host-side `plugin.js`, `icon.svg`, the iframe UI template `index.html`, and `pack.mjs`, which builds `dist/horizoncore.zip` (flat, manifest at top level) and prints its SHA-256. Run it with `npm run pack`.
- `web/` — the web app shell. Scaffold only — see `web/README.md` for the open questions.
- `scripts/validate.mjs` — runs the engine against a real Super Productivity sync-data snapshot (`SP_SNAPSHOT` env var) and prints what it would deal and draw. Run it with `npm run validate`.

Requires Node 20+. No runtime dependencies. For editor autocomplete of the PluginAPI in VS Code, run `npm install` once (it only fetches the type definitions as a devDependency).

## License

Free. Take it, fork it, make it yours — that's the point.

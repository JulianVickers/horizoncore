# HorizonCore — web app (scaffold)

Status: **scaffold only.** No code yet. The direction was set on 2026-11-18 after the idea got a strong response from people who don't use Super Productivity — the web app is the same HorizonCore, reachable by anyone with a browser.

## What this shell is

- The **timeline view** and the **nightly deal**, running on the shared engine in [`../core/`](../core/). The core is the single source of truth — this shell consumes it, never forks it.
- Its own data layer: the plugin reads Super Productivity's tasks through the PluginAPI; the web app can't, so it keeps its own projects/tasks (local-first is the leading candidate) with the same shapes the engine already eats: due dates where they exist, activity timestamps for staleness, tags for readiness.
- Julian's design principles carry over unchanged: the engine is universal, personal tunings (light day, staleness window, horizon) are user settings with sane defaults, and the whole thing is given away.

## Open questions (decide before building)

1. **Data home:** local-first (browser storage, no accounts) vs synced accounts. Local-first matches the giveaway spirit and the SP plugin's privacy posture; accounts are a much bigger build.
2. **Import:** should a Super Productivity user be able to import their SP export/sync data? (The shapes are known — Spark has read one.)
3. **Stack:** undecided. Whatever serves a static-first, minimal-moving-parts build — Julian's standing preference from his client-site work.

## Neighbours

- [`../core/`](../core/) — the shared engine (dealing + timeline model).
- [`../plugin-sp/`](../plugin-sp/) — the Super Productivity plugin, v0.2.0, working today.

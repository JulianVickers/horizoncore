/*
 * Validation harness: run the shipped dealing engine against Julian's real
 * Super Productivity snapshot (the Dropbox sync-data.json downloaded
 * 2026-11-18) and show what it would deal. Storage shape is adapted to the
 * PluginAPI shape (notably `modified` -> `updated`); the engine code itself
 * is the exact file inlined into the plugin.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Dealer = require('../src/engine.js');

const SNAPSHOT = process.env.SP_SNAPSHOT ||
  '/home/hatch/workspace/goals/deadline-timeline/hidden_files/sp/sync-data.json';

const raw = readFileSync(SNAPSHOT, 'utf8');
const data = JSON.parse(raw.slice(raw.indexOf('{')));
const st = data.state;

const tasks = Object.values(st.task.entities).map((t) => ({
  id: t.id,
  title: t.title,
  isDone: !!t.isDone,
  projectId: t.projectId ?? null,
  parentId: t.parentId ?? null,
  subTaskIds: t.subTaskIds || [],
  tagIds: t.tagIds || [],
  created: t.created || 0,
  updated: t.modified || t.created || 0,
  timeSpentOnDay: t.timeSpentOnDay || {},
  dueDay: t.dueDay ?? null,
  dueWithTime: t.dueWithTime ?? null,
  repeatCfgId: t.repeatCfgId ?? null,
}));
const projects = Object.values(st.project.entities).map((p) => ({
  id: p.id, title: p.title, isArchived: !!p.isArchived, taskIds: p.taskIds || [],
}));
const tags = Object.values(st.tag.entities).map((t) => ({ id: t.id, title: t.title }));

function run(label, targetDateStr, settings, dealsByDate, rng) {
  const ctx = { tasks, projects, tags, settings, dealsByDate: dealsByDate || {}, targetDateStr, rng };
  const analysis = Dealer.analyze(ctx);
  const eligible = analysis.rows.filter((r) => r.eligible);
  const excluded = analysis.rows.filter((r) => !r.eligible);
  const byReason = {};
  excluded.forEach((r) => { byReason[r.excludedReason] = (byReason[r.excludedReason] || 0) + 1; });
  console.log(`\n=== ${label} — target ${targetDateStr} (light day: ${analysis.isLightDay}) ===`);
  console.log(`pool: ${eligible.length} eligible / ${analysis.rows.length} tasks considered`);
  console.log('excluded:', JSON.stringify(byReason));
  const top = [...eligible].sort((a, b) => b.score - a.score).slice(0, 5);
  console.log('top candidates:');
  top.forEach((r) => console.log(
    `  score=${r.score.toFixed(1)} stale=${r.staleDays}d due=${r.daysUntilDue === null ? '—' : r.daysUntilDue + 'd'}` +
    ` [${r.projectTitle}] ${r.task.title}`));
  const d = Dealer.deal(ctx);
  console.log(d
    ? `DEALT: [${d.projectTitle}] "${d.taskTitle}" — ${d.reason}`
    : 'DEALT: nothing (empty pool)');
  return d;
}

// Deterministic rng that never triggers the wildcat.
const noWildcat = () => 0.99;

// Thu 2026-11-19: a normal day, empty history, Julian's preset settings.
run('Normal day', '2026-11-19', {}, {}, noWildcat);

// Same day, but the winning project was already dealt the two previous days:
// the consecutive cap should rest it and deal the runner-up instead.
const first = Dealer.deal({ tasks, projects, tags, settings: {}, dealsByDate: {}, targetDateStr: '2026-11-19', rng: noWildcat });
if (first && first.projectId) {
  const history = {
    '2026-11-17': { taskId: 'x', projectId: first.projectId },
    '2026-11-18': { taskId: 'y', projectId: first.projectId },
  };
  run('Consecutive cap (winning project dealt Nov 17 + 18)', '2026-11-19', {}, history, noWildcat);
}

// Mon 2026-11-23: Julian's light day.
run('Light day (Monday)', '2026-11-23', {}, {}, noWildcat);

// Exemption demo: exempt every project except one small one.
const exemptAllBut = projects.filter((p) => p.title !== 'Trading').map((p) => p.id);
run('Exemption (all projects but Trading exempt)', '2026-11-19',
  { exemptProjectIds: exemptAllBut }, {}, noWildcat);

// Timeline view, as of Wed 2026-11-18, default 6-month horizon.
const tl = Dealer.buildTimeline({ tasks, projects, tags, settings: {}, todayStr: '2026-11-18' });
console.log(`\n=== Timeline — today 2026-11-18, horizon ${tl.horizonStr} (${tl.horizonDays}d) ===`);
if (!tl.strips.length) console.log('  (no strips — no project carries a dated open task)');
tl.strips.forEach((s) => {
  console.log(`  "${s.title}" tracked=${s.tracked} end=${s.endStr} (${s.daysToEnd}d)` +
    ` next=${s.nextStr} (${s.daysToNext}d) overdue=${s.overdue} jagged=${s.jagged}`);
  s.dots.forEach((d) => console.log(`      dot ${d.dateStr} (${d.days}d)${d.isRepeat ? ' [repeat]' : ''} — ${d.title}`));
});

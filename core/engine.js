/*
 * HorizonCore — dealing engine.
 *
 * Pure functions, no PluginAPI calls: given tasks/projects/tags in the
 * PluginAPI shape, the user's settings, and the deal history, pick ONE task
 * for a target date and say why. The same file is inlined into index.html by
 * plugin-sp/pack.mjs and required by scripts/validate.mjs, so the validated
 * code is byte-for-byte the shipped code.
 *
 * The rules, in order (Julian's deck, translated):
 *   1. Deadline pressure first — a due date inside the window outranks all.
 *   2. Staleness second — untouched past the threshold pulls harder with age.
 *   3. Readiness third — priority tags and already-moving tasks nudge up.
 * Guardrails: routines (repeat configs), parked/blocked/delegated tags,
 * subtasks, archived projects and user-exempted projects are never dealt.
 * A project dealt the max consecutive days running rests, unless a hard
 * deadline in it demands otherwise. On the user's light day the dealer
 * prefers warm (recently touched / in-progress) tasks. Occasionally it
 * deals a wildcat: any eligible task at random.
 */
(function (root) {
  'use strict';

  var DAY_MS = 86400000;

  var DEFAULT_SETTINGS = {
    // Days untouched before a task starts pulling. (Julian: ~10.)
    stalenessDays: 10,
    // Max days in a row one project may be dealt before it rests. (Julian: 2.)
    maxConsecutiveDays: 2,
    // Weekday (0=Sunday … 6=Saturday) that gets a light card, or null for none.
    // (Julian: Monday = 1.)
    lightDay: 1,
    // Chance per deal of a wildcat — any eligible task at random. (Julian: ~1 in 7.)
    wildcatChance: 1 / 7,
    // Project ids the dealer must never touch. Curated by the user.
    exemptProjectIds: [],
    // Tag titles (case-insensitive) that park a task out of the pool.
    excludeTagTitles: ['DEFER', 'BLOCKED', 'DELEGATED'],
    // Tag titles (case-insensitive) that add priority weight.
    priorityTagWeights: { P1: 15, P2: 8, P3: 3 },
    // Tag title (case-insensitive) marking a task as already moving.
    inProgressTagTitle: 'IN-PROGRESS',
    // A deadline this many days out (or closer) starts scoring.
    deadlineWindowDays: 30,
    // Timeline view: how far ahead the board looks, in months. (Julian: 6.)
    timelineHorizonMonths: 6
  };

  function parseDayStr(dayStr) {
    // Noon UTC keeps weekday/day-diff math stable in any local timezone.
    return Date.parse(dayStr + 'T12:00:00Z');
  }

  function toDayStr(ms) {
    var d = new Date(ms);
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + m + '-' + dd;
  }

  function addDays(dayStr, n) {
    return toDayStr(parseDayStr(dayStr) + n * DAY_MS);
  }

  function weekdayOf(dayStr) {
    return new Date(parseDayStr(dayStr)).getUTCDay();
  }

  function lastActivityMs(task) {
    var last = task.updated || task.created || 0;
    if (task.timeSpentOnDay) {
      Object.keys(task.timeSpentOnDay).forEach(function (day) {
        if (task.timeSpentOnDay[day] > 0) {
          var ms = parseDayStr(day);
          if (ms > last) last = ms;
        }
      });
    }
    return last;
  }

  function dueMs(task) {
    if (task.dueWithTime) return task.dueWithTime;
    if (task.dueDay) return parseDayStr(task.dueDay);
    return null;
  }

  function tagTitlesOf(task, tagById) {
    return (task.tagIds || []).map(function (id) {
      var t = tagById[id];
      return t ? String(t.title).trim().toUpperCase() : '';
    });
  }

  // Consecutive days immediately before targetDateStr on which this project
  // was the dealt project.
  function consecutiveDays(dealsByDate, projectId, targetDateStr) {
    var count = 0;
    var cursor = addDays(targetDateStr, -1);
    while (dealsByDate[cursor] && dealsByDate[cursor].projectId === projectId) {
      count++;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function analyze(ctx) {
    var settings = Object.assign({}, DEFAULT_SETTINGS, ctx.settings || {});
    var tagById = {};
    (ctx.tags || []).forEach(function (t) { tagById[t.id] = t; });
    var projectById = {};
    (ctx.projects || []).forEach(function (p) { projectById[p.id] = p; });
    var targetMs = parseDayStr(ctx.targetDateStr);
    var excludeTags = settings.excludeTagTitles.map(function (s) {
      return String(s).trim().toUpperCase();
    });
    var priorityWeights = {};
    Object.keys(settings.priorityTagWeights || {}).forEach(function (k) {
      priorityWeights[k.trim().toUpperCase()] = settings.priorityTagWeights[k];
    });
    var inProgressTitle = String(settings.inProgressTagTitle || '').trim().toUpperCase();
    var isLightDay = settings.lightDay !== null && settings.lightDay !== undefined &&
      weekdayOf(ctx.targetDateStr) === settings.lightDay;
    var swappedOut = {};
    (ctx.excludeTaskIds || []).forEach(function (id) { swappedOut[id] = true; });

    var rows = [];
    (ctx.tasks || []).forEach(function (task) {
      var why = null;
      if (task.isDone) why = 'done';
      else if (task.parentId) why = 'subtask';
      else if (task.repeatCfgId) why = 'routine (repeat config)';
      else if (swappedOut[task.id]) why = 'swapped out';
      var project = task.projectId ? projectById[task.projectId] : null;
      if (!why && project && project.isArchived) why = 'archived project';
      if (!why && task.projectId && settings.exemptProjectIds.indexOf(task.projectId) !== -1) {
        why = 'exempt project';
      }
      var titles = tagTitlesOf(task, tagById);
      if (!why) {
        for (var i = 0; i < titles.length; i++) {
          if (excludeTags.indexOf(titles[i]) !== -1) { why = 'tagged ' + titles[i]; break; }
        }
      }

      var due = dueMs(task);
      var daysUntilDue = due === null ? null : Math.round((due - targetMs) / DAY_MS);
      var staleDays = Math.max(0, Math.round((targetMs - lastActivityMs(task)) / DAY_MS));
      var projectId = task.projectId || null;

      // Consecutive-day rest, with a hard-deadline override.
      var rested = false;
      if (!why && projectId) {
        var run = consecutiveDays(ctx.dealsByDate || {}, projectId, ctx.targetDateStr);
        var deadlineDemands = daysUntilDue !== null && daysUntilDue <= 1;
        if (run >= settings.maxConsecutiveDays && !deadlineDemands) {
          rested = true;
          why = 'project resting (' + run + ' days dealt in a row)';
        }
      }
      if (why) {
        rows.push({ task: task, eligible: false, excludedReason: why, staleDays: staleDays, daysUntilDue: daysUntilDue });
        return;
      }

      // Scoring.
      var deadlineScore = 0;
      if (daysUntilDue !== null && daysUntilDue <= settings.deadlineWindowDays) {
        deadlineScore = (settings.deadlineWindowDays - daysUntilDue + 1) * 10;
        if (daysUntilDue < 0) deadlineScore += 100; // overdue outranks everything
      }
      var stalenessScore = staleDays >= settings.stalenessDays ? staleDays - settings.stalenessDays + 1 : 0;
      var priorityScore = 0;
      titles.forEach(function (t) { if (priorityWeights[t]) priorityScore += priorityWeights[t]; });
      var warm = staleDays < settings.stalenessDays || titles.indexOf(inProgressTitle) !== -1;
      var inProgressScore = titles.indexOf(inProgressTitle) !== -1 ? 5 : 0;

      var score, mode;
      if (isLightDay) {
        // Light day: warmth wins — the softest useful card, not the loudest.
        mode = 'light';
        score = (warm ? 50 : 0) + priorityScore + Math.max(0, 40 - staleDays) + deadlineScore * 0.25;
      } else {
        mode = 'normal';
        score = deadlineScore + stalenessScore + priorityScore + inProgressScore;
      }

      rows.push({
        task: task,
        eligible: true,
        projectId: projectId,
        projectTitle: project ? project.title : '(no project)',
        staleDays: staleDays,
        daysUntilDue: daysUntilDue,
        deadlineScore: deadlineScore,
        stalenessScore: stalenessScore,
        priorityScore: priorityScore,
        inProgressScore: inProgressScore,
        warm: warm,
        score: score,
        mode: mode
      });
    });
    return { rows: rows, settings: settings, isLightDay: isLightDay };
  }

  function reasonFor(row, settings, wasWildcat) {
    if (wasWildcat) return 'Wildcat — any card in the deck, dealt blind.';
    if (row.daysUntilDue !== null && row.daysUntilDue < 0) {
      return 'Overdue by ' + Math.abs(row.daysUntilDue) + (Math.abs(row.daysUntilDue) === 1 ? ' day' : ' days') + '.';
    }
    if (row.daysUntilDue !== null && row.daysUntilDue <= settings.deadlineWindowDays && row.deadlineScore >= row.stalenessScore) {
      if (row.daysUntilDue === 0) return 'Due today.';
      if (row.daysUntilDue === 1) return 'Due tomorrow.';
      return 'Due in ' + row.daysUntilDue + ' days.';
    }
    if (row.mode === 'light') return 'Light day — already warm, kept gentle.';
    if (row.stalenessScore > 0) {
      return 'Untouched for ' + row.staleDays + ' days — the deck pulls what has waited longest.';
    }
    if (row.priorityScore > 0) return 'Priority-tagged and ready.';
    if (row.inProgressScore > 0) return 'Already in motion — keep it moving.';
    return 'Next up by the deck\u2019s quiet arithmetic.';
  }

  function deal(ctx) {
    var analysis = analyze(ctx);
    var settings = analysis.settings;
    var pool = analysis.rows.filter(function (r) { return r.eligible; });
    if (!pool.length) return null;
    var rng = ctx.rng || Math.random;

    var wasWildcat = false;
    var pick = null;
    if (!analysis.isLightDay && settings.wildcatChance > 0 && rng() < settings.wildcatChance) {
      pick = pool[Math.floor(rng() * pool.length)];
      wasWildcat = true;
    } else {
      pool.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (b.staleDays !== a.staleDays) return b.staleDays - a.staleDays;
        if (a.task.created !== b.task.created) return (a.task.created || 0) - (b.task.created || 0);
        return a.task.id < b.task.id ? -1 : 1;
      });
      pick = pool[0];
    }
    return {
      taskId: pick.task.id,
      taskTitle: pick.task.title,
      projectId: pick.projectId,
      projectTitle: pick.projectTitle,
      dateStr: ctx.targetDateStr,
      reason: reasonFor(pick, settings, wasWildcat),
      wildcat: wasWildcat,
      lightDay: analysis.isLightDay,
      score: Math.round(pick.score * 10) / 10,
      staleDays: pick.staleDays,
      daysUntilDue: pick.daysUntilDue
    };
  }

  function addMonths(dayStr, n) {
    var d = new Date(parseDayStr(dayStr));
    d.setUTCMonth(d.getUTCMonth() + n);
    return toDayStr(d.getTime());
  }

  /*
   * The timeline view, translated from Julian's calendar board:
   * one strip per project that carries dated open tasks. Every dated task
   * is a milestone dot; the strip ends at the furthest one and sorts by
   * days remaining. A project whose dated tasks come from a repeat config
   * is a tracked series — its strip runs to the horizon with a torn edge
   * and sorts by its next occurrence. Projects with no dated tasks are
   * not on the board at all: they belong to the dealer, not the timeline.
   * Exempt projects still show here — exemption is from dealing, not seeing.
   */
  function buildTimeline(ctx) {
    var settings = Object.assign({}, DEFAULT_SETTINGS, ctx.settings || {});
    var projectById = {};
    (ctx.projects || []).forEach(function (p) { projectById[p.id] = p; });
    var todayMs = parseDayStr(ctx.todayStr);
    var horizonStr = addMonths(ctx.todayStr, settings.timelineHorizonMonths || 6);
    var horizonMs = parseDayStr(horizonStr);
    var horizonDays = Math.max(1, Math.round((horizonMs - todayMs) / DAY_MS));

    var byProject = {};
    (ctx.tasks || []).forEach(function (task) {
      if (task.isDone || task.parentId) return;
      var due = dueMs(task);
      if (due === null) return;
      var key = task.projectId || '__none__';
      if (!byProject[key]) byProject[key] = { project: task.projectId ? projectById[task.projectId] : null, dated: [] };
      byProject[key].dated.push({ task: task, dueMs: due, isRepeat: !!task.repeatCfgId });
    });

    var strips = [];
    Object.keys(byProject).forEach(function (key) {
      var group = byProject[key];
      var dots = group.dated
        .slice()
        .sort(function (a, b) { return a.dueMs - b.dueMs; })
        .map(function (d) {
          return {
            dateStr: toDayStr(d.dueMs),
            days: Math.round((d.dueMs - todayMs) / DAY_MS),
            title: d.task.title,
            isRepeat: d.isRepeat
          };
        });
      var tracked = group.dated.some(function (d) { return d.isRepeat; });
      var lastDot = dots[dots.length - 1];
      var endStr = tracked ? horizonStr : lastDot.dateStr;
      var daysToEnd = tracked ? horizonDays : lastDot.days;
      var next = null;
      for (var i = 0; i < dots.length; i++) {
        if (dots[i].days >= 0) { next = dots[i]; break; }
      }
      var clipped = !tracked && daysToEnd > horizonDays;
      strips.push({
        projectId: key === '__none__' ? null : key,
        title: group.project ? group.project.title : '(no project)',
        tracked: tracked,
        endStr: endStr,
        daysToEnd: daysToEnd,
        nextStr: next ? next.dateStr : null,
        daysToNext: next ? next.days : null,
        overdue: !next,
        clipped: clipped,
        jagged: tracked || clipped,
        dots: dots,
        horizonDays: horizonDays,
        sortKey: tracked ? (next ? next.days : daysToEnd) : daysToEnd
      });
    });
    strips.sort(function (a, b) {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.title.localeCompare(b.title);
    });
    return { strips: strips, horizonStr: horizonStr, horizonDays: horizonDays };
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    analyze: analyze,
    deal: deal,
    buildTimeline: buildTimeline,
    addDays: addDays,
    addMonths: addMonths,
    toDayStr: toDayStr,
    weekdayOf: weekdayOf,
    lastActivityMs: lastActivityMs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HorizonCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

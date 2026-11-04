(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotoEnglishCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const INTERVALS = [1, 3, 7, 14];
  const VERSION = 1;
  function emptyState() { return { version: VERSION, reviews: {} }; }
  function schedule(state, id, days, now = new Date()) {
    if (!INTERVALS.includes(days)) throw new Error('Недопустимый интервал');
    const due = new Date(now);
    due.setDate(due.getDate() + days);
    const previous = state.reviews[id];
    return { version: VERSION, reviews: { ...state.reviews, [id]: {
      lastReviewed: now.toISOString(), due: due.toISOString(), interval: days,
      repetitions: (previous?.repetitions || 0) + 1
    } } };
  }
  function status(record, now = new Date()) {
    if (!record) return 'new';
    return new Date(record.due).getTime() <= now.getTime() ? 'due' : 'scheduled';
  }
  function getQueue(cards, state, filter = 'all', now = new Date()) {
    const priority = { due: 0, new: 1, scheduled: 2 };
    return cards.filter(card => filter === 'all' || status(state.reviews[card.id], now) === filter)
      .sort((a, b) => {
        const ar = state.reviews[a.id], br = state.reviews[b.id];
        const delta = priority[status(ar, now)] - priority[status(br, now)];
        return delta || ((ar && br) ? Date.parse(ar.due) - Date.parse(br.due) : 0);
      });
  }
  function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function validateState(input, validIds) {
    if (!input || input.version !== VERSION || !input.reviews || typeof input.reviews !== 'object' || Array.isArray(input.reviews)) throw new Error('Формат файла не подходит');
    const allowed = new Set(validIds), result = emptyState();
    for (const [id, r] of Object.entries(input.reviews)) {
      if (!allowed.has(id)) throw new Error('Файл относится к другому сборнику');
      if (!r || !validDate(r.due) || !validDate(r.lastReviewed) || !INTERVALS.includes(r.interval) || !Number.isSafeInteger(r.repetitions) || r.repetitions < 1 || Date.parse(r.due) < Date.parse(r.lastReviewed)) throw new Error('В файле повреждены даты или отметки повторения');
      result.reviews[id] = { due: new Date(r.due).toISOString(), lastReviewed: new Date(r.lastReviewed).toISOString(), interval: r.interval, repetitions: r.repetitions };
    }
    return result;
  }
  function mergeStates(current, incoming) {
    const reviews = { ...current.reviews };
    for (const [id, r] of Object.entries(incoming.reviews)) if (!reviews[id] || Date.parse(r.lastReviewed) > Date.parse(reviews[id].lastReviewed)) reviews[id] = { ...r };
    return { version: VERSION, reviews };
  }
  return { INTERVALS, VERSION, emptyState, schedule, status, getQueue, validateState, mergeStates };
});

(() => {
  'use strict';
  const data = window.PHOTO_ENGLISH, Core = window.PhotoEnglishCore;
  const main = document.getElementById('main');
  if (!data?.modules?.length || !Core) {
    main.textContent = 'Материал не загрузился. Откройте приложение из полной папки English Photo Notes.';
    return;
  }
  const modules = data.modules;
  const allCards = modules.flatMap(m => m.cards.map(c => ({ ...c, moduleId: m.id, moduleTitle: m.title })));
  const tracksFor = m => (m.listening?.length ? m.listening : m.cards.map(c => ({
    id: `listen-${c.id}`, title: c.cue, text: c.audioText || `${c.answer} ${c.example}`,
    translation: [c.translation, c.exampleTranslation].filter(Boolean).join('\n'), note: 'Уловите фразу на слух, затем откройте текст и повторите её в другом контексте.', audioId: c.audioId
  })));
  const allTracks = modules.flatMap(m => tracksFor(m).map(t => ({ ...t, moduleId: m.id, moduleTitle: m.title })));
  const readyAudio = new Set(window.PHOTO_ENGLISH_AUDIO?.voice === 'en-GB-RyanNeural' ? window.PHOTO_ENGLISH_AUDIO.ready || [] : []);
  const ids = allCards.map(c => c.id);
  const STORAGE_KEY = 'english-photo-notes.progress.v1';
  let progress = Core.emptyState();
  let storageProblem = false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) progress = Core.validateState(JSON.parse(saved), ids);
  } catch (_) { storageProblem = true; }
  let currentView = 'topics', currentModule = null, currentTab = 'lesson';
  let queue = [], cardIndex = 0, queueKey = '', reviewFilter = 'all';
  let sessionDone = false, sessionChoices = 0;
  let topicQuery = '', listeningModule = 'all', listeningPage = 0;
  const audio = document.getElementById('audio');
  let audioToken = 0, currentAudio = null;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'class') node.className = value;
      else if (key === 'hidden') node.hidden = value;
      else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    }
    for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }
  const p = (text, cls = '') => el('p', { class: cls }, text);
  const button = (text, action, cls = '', attrs = {}) => el('button', { type: 'button', class: cls, onclick: action, ...attrs }, text);
  const english = (text, cls = '') => pEnglish(text, cls);
  function pEnglish(text, cls) { return el('p', { class: `english ${cls}`, lang: 'en' }, text); }
  function notice(message) {
    const target = document.getElementById('notice');
    target.textContent = message;
    target.hidden = false;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); storageProblem = false; return true; }
    catch (_) { storageProblem = true; notice('В этом браузере не удалось сохранить повторение. Пока страница открыта, отметки доступны. Сохраните файл в разделе «Мой прогресс».'); return false; }
  }
  function dateLabel(value) {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  }
  function plural(n, forms) { const mod = n % 100; return forms[mod >= 11 && mod <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]; }
  function route(hash) {
    if (window.location.hash === hash) { parseRoute(); render(true); }
    else window.location.hash = hash;
  }
  function parseRoute() {
    const parts = location.hash.slice(1).split('/');
    currentModule = null;
    if (parts[0] === 'topic') {
      currentModule = modules.find(m => m.id === parts[1]) || null;
      currentView = currentModule ? 'module' : 'topics';
      currentTab = ['lesson', 'recall', 'listen'].includes(parts[2]) ? parts[2] : 'lesson';
    } else currentView = ['topics', 'review', 'listening', 'progress'].includes(parts[0]) ? parts[0] : 'topics';
  }
  function ensureQueue(key, cards) {
    if (queueKey === key) return;
    queueKey = key; queue = cards; cardIndex = 0; sessionDone = false; sessionChoices = 0;
  }
  function render(focus = false) {
    document.querySelectorAll('[data-view]').forEach(b => {
      if (b.dataset.view === (currentView === 'module' ? 'topics' : currentView)) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const due = allCards.filter(c => Core.status(progress.reviews[c.id]) === 'due').length;
    const badge = document.getElementById('due-badge'); badge.textContent = due; badge.hidden = !due;
    main.replaceChildren();
    if (currentView === 'module') renderModule();
    else if (currentView === 'review') renderReview();
    else if (currentView === 'listening') renderListening();
    else if (currentView === 'progress') renderProgress();
    else renderTopics();
    document.title = `${currentModule?.title || ({ topics: 'English', review: 'Повторение', listening: 'Слушать', progress: 'Мой прогресс' }[currentView])} · Photo Notes`;
    if (focus) main.focus({ preventScroll: true });
  }
  function renderTopics() {
    queueKey = '';
    const due = allCards.filter(c => Core.status(progress.reviews[c.id]) === 'due').length;
    const started = Object.keys(progress.reviews).length;
    const hero = el('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
      el('div', { class: 'hero-copy' }, p('ИЗ ВАШИХ ФОТОГРАФИЙ · НОВЫЕ КОНТЕКСТЫ', 'eyebrow'),
        el('h1', { id: 'hero-title' }, data.title), p(data.intro, 'lede'),
        el('div', { class: 'actions' }, button(due ? `Повторить сейчас · ${due}` : started ? 'Вернуться к карточкам' : 'Открыть первую тему', () => route(due || started ? '#review' : `#topic/${modules[0].id}/lesson`), 'primary'), button(readyAudio.size ? 'Послушать Ryan' : 'Открыть аудиотексты', () => route('#listening'), 'quiet'))),
      el('div', { class: 'hero-art', 'aria-hidden': 'true' }, p('A NOTE WORTH KEEPING', 'art-label'), p('The right words.\nThe right tone.', 'art-en'), el('span', { class: 'art-rule' }), p('Вспомнить фразу. Услышать её. Сказать по-своему.', 'art-note')));
    main.append(hero, el('div', { class: 'collection-heading' }, el('h2', {}, data.collectionTitle || 'Выберите тему'), p(`${modules.length} ${plural(modules.length, ['тема', 'темы', 'тем'])} · ${allCards.length} ${plural(allCards.length, ['карточка', 'карточки', 'карточек'])}`, 'muted small')));
    const search = el('input', { type: 'search', value: topicQuery, placeholder: 'Тема, слово или фраза', 'aria-label': 'Найти учебный материал', autocomplete: 'off' });
    const searchCount = p('', 'muted small');
    const searchRow = el('div', { class: 'topic-search' }, el('label', { class: 'search-field' }, 'Найти в сборнике', search), searchCount);
    const grid = el('div', { class: 'topic-grid' });
    function drawTopics() {
      grid.replaceChildren();
      const query = topicQuery.toLocaleLowerCase('ru').trim();
      const filtered = modules.filter(m => !query || [m.title, m.subtitle, m.englishTitle, m.category, m.idea, ...m.cards.flatMap(c => [c.cue, c.answer, c.example, c.note])].join(' ').toLocaleLowerCase('ru').includes(query));
      searchCount.textContent = query ? `Найдено тем: ${filtered.length}` : 'Ищите по-русски или по-английски.';
      filtered.forEach(m => {
      const i = modules.indexOf(m);
      const planned = m.cards.filter(c => progress.reviews[c.id]).length;
      grid.append(el('a', { class: 'topic-card', href: `#topic/${m.id}/lesson` },
        el('div', { class: 'topic-top' }, el('span', { class: 'topic-number' }, String(i + 1).padStart(2, '0')), el('span', {}, m.category || 'ПЕРЕПИСКА')),
        el('h3', {}, m.title), p(m.subtitle, 'topic-desc'), el('p', { class: 'topic-en', lang: 'en' }, m.englishTitle),
        el('div', { class: 'topic-footer' }, el('span', {}, planned ? `${planned} ${plural(planned, ['карточка', 'карточки', 'карточек'])} с датой повтора` : `${m.cards.length} ${plural(m.cards.length, ['карточка', 'карточки', 'карточек'])} · Ryan`), el('span', { class: 'arrow', 'aria-hidden': 'true' }, '↗'))));
      });
      if (!filtered.length) grid.append(p('Совпадений пока нет. Попробуйте другое слово или очистите поиск.', 'empty-state'));
    }
    search.addEventListener('input', event => { topicQuery = event.target.value; drawTopics(); });
    drawTopics();
    main.append(searchRow, grid, el('div', { class: 'support-row' }, el('span', {}, 'Короткая мысль → пример → самостоятельное воспроизведение.'), el('span', {}, readyAudio.size ? 'Ryan · британский английский. Записанный синтетический голос.' : 'Аудиозаписи Ryan пока недоступны. Все тексты можно читать.'), el('span', {}, 'Повторение через 1, 3, 7 или 14 дней — по вашему выбору.')));
  }
  function renderModule() {
    const m = currentModule, index = modules.indexOf(m);
    main.append(el('a', { href: '#topics', class: 'back-link' }, '← Все темы'), el('header', { class: 'module-heading' },
      p(`ТЕМА ${String(index + 1).padStart(2, '0')} / ${String(modules.length).padStart(2, '0')} · B1–B2`, 'eyebrow'), el('h1', {}, m.title), p(m.subtitle, 'lede')));
    const tabs = el('div', { class: 'module-tabs', 'aria-label': 'Формат занятия' });
    for (const [id, title] of [['lesson', 'Разобраться'], ['recall', 'Вспомнить'], ['listen', 'Услышать']]) tabs.append(button(title, () => route(`#topic/${m.id}/${id}`), '', { 'aria-pressed': id === currentTab }));
    main.append(tabs);
    if (currentTab === 'recall') {
      ensureQueue(`module-${m.id}`, allCards.filter(c => c.moduleId === m.id));
      main.append(renderRecall());
    } else if (currentTab === 'listen') {
      queueKey = '';
      const wrap = el('div', { class: 'recall-wrap' }); tracksFor(m).forEach(t => wrap.append(listeningCard({ ...t, moduleTitle: m.title })));
      main.append(wrap);
    } else {
      queueKey = '';
      const panel = el('section', { class: 'lesson-panel' }, p('ОДНА ГЛАВНАЯ МЫСЛЬ', 'eyebrow'), p(m.idea, 'lesson-idea'), p(m.pattern, 'pattern'));
      m.examples.forEach((ex, i) => panel.append(el('div', { class: 'example' }, el('span', { class: 'example-num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), el('div', {}, english(ex.en), p(ex.ru, 'translation'), p(ex.note, 'note')))));
      if (m.usage) panel.append(el('div', { class: 'usage-note' }, el('strong', {}, 'Нюанс. '), m.usage));
      panel.append(el('div', { class: 'actions' }, button('Попробовать вспомнить', () => route(`#topic/${m.id}/recall`), 'primary')));
      const aside = el('aside', { class: 'lesson-aside' }, p('ПЕРЕНОС В СВОЙ КОНТЕКСТ', 'eyebrow'), p(m.transferTitle || 'Попробуйте по-своему', 'aside-title'), p(m.transfer), p('Учебные ситуации и примеры в этом сборнике придуманы специально для практики.'));
      main.append(el('div', { class: 'lesson-layout' }, panel, aside));
    }
  }
  function renderReview() {
    const select = el('select', { 'aria-label': 'Какие карточки повторить', onchange: event => { reviewFilter = event.target.value; queueKey = ''; render(); } });
    for (const [value, label] of [['all', 'Все карточки'], ['due', 'Пора вернуться'], ['new', 'Без даты повтора'], ['scheduled', 'Запланированы позже']]) select.append(el('option', { value, ...(value === reviewFilter ? { selected: '' } : {}) }, label));
    main.append(el('div', { class: 'review-toolbar' }, el('div', {}, p('СНАЧАЛА ПОПРОБУЙТЕ САМИ', 'eyebrow'), el('h1', {}, 'Вспомнить фразу'), p('Произнесите вслух или восстановите мысленно. Затем откройте ответ.', 'lede')), el('label', { class: 'select-field' }, 'Подборка', select)));
    ensureQueue(`review-${reviewFilter}`, Core.getQueue(allCards, progress, reviewFilter));
    main.append(renderRecall());
  }
  function renderRecall() {
    const wrap = el('div', { class: 'recall-wrap' });
    if (!queue.length || sessionDone) {
      const empty = el('section', { class: 'empty-state' }, p('В СВОЁМ РИТМЕ', 'eyebrow'), el('h2', {}, sessionDone ? 'Можно сделать паузу' : 'Здесь пока нет карточек'), p(sessionDone ? `В этой подборке выбраны даты повторения: ${sessionChoices}. Вернитесь к темам или послушайте примеры.` : 'Вы можете выбрать все карточки или вернуться к темам — следующую дату назначаете вы.'), el('div', { class: 'actions' }, button('К темам', () => route('#topics'), 'primary'), button(sessionDone ? 'Пройти подборку снова' : 'Все карточки', () => { reviewFilter = 'all'; queueKey = ''; sessionDone = false; if (currentView === 'review') render(); else { ensureQueue(`module-${currentModule.id}`, allCards.filter(c => c.moduleId === currentModule.id)); render(); } })));
      wrap.append(empty); return wrap;
    }
    const c = queue[cardIndex], record = progress.reviews[c.id];
    const meta = el('div', { class: 'recall-meta' }, el('span', {}, c.moduleTitle), el('span', {}, `${cardIndex + 1} / ${queue.length}`));
    const card = el('section', { class: 'recall-card', 'aria-label': 'Карточка для воспроизведения' }, p('КАК СКАЗАТЬ ПО-АНГЛИЙСКИ?', 'eyebrow'), p(c.cue, 'recall-cue'), p(c.context || 'Сформулируйте свою версию. Точное совпадение слов не обязательно.', 'recall-context'));
    const answerId = `answer-${c.id}`;
    const answer = el('div', { class: 'answer', id: answerId, hidden: true }, english(c.answer, 'answer-en'), p(c.translation, 'translation'),
      el('div', { class: 'example' }, el('div', {}, p('ПРИМЕР В КОНТЕКСТЕ', 'eyebrow'), english(c.example), c.exampleTranslation ? p(c.exampleTranslation, 'translation') : null, p(c.note, 'note'))), audioButton(c.audioId, c.answer));
    const schedule = el('div', { class: 'schedule-area' }, p('Когда вернуться к этой фразе? Если было трудно, выберите 1 день.'));
    const intervals = el('div', { class: 'schedule-buttons' });
    Core.INTERVALS.forEach(days => intervals.append(button(`Через ${days} ${plural(days, ['день', 'дня', 'дней'])}`, () => {
      stopAudio();
      progress = Core.schedule(progress, c.id, days); const saved = persist(); sessionChoices += 1;
      const msg = `Следующий возврат — ${dateLabel(progress.reviews[c.id].due)}`;
      if (saved) notice(msg);
      if (cardIndex < queue.length - 1) cardIndex += 1; else sessionDone = true;
      render(true);
    })));
    schedule.append(intervals); answer.append(schedule);
    const reveal = button('Показать ответ', () => { answer.hidden = !answer.hidden; reveal.setAttribute('aria-expanded', String(!answer.hidden)); reveal.textContent = answer.hidden ? 'Показать ответ' : 'Скрыть ответ'; }, 'primary', { 'aria-expanded': 'false', 'aria-controls': answerId });
    card.append(reveal, answer);
    if (record) card.append(p(`Следующее повторение: ${dateLabel(record.due)}`, 'schedule-label'));
    const prev = button('← Предыдущая', () => { cardIndex -= 1; stopAudio(); render(true); }, '', { disabled: cardIndex === 0 ? '' : undefined });
    const next = button('Следующая →', () => { cardIndex += 1; stopAudio(); render(true); }, '', { disabled: cardIndex === queue.length - 1 ? '' : undefined });
    wrap.append(meta, card, el('div', { class: 'card-navigation' }, prev, next));
    return wrap;
  }
  function audioButton(id, title) {
    const ready = readyAudio.has(id);
    return button(ready ? '▷ Слушать Ryan' : 'Ryan · запись пока недоступна', () => playAudio(id, title), 'audio-button', { disabled: ready ? undefined : '' });
  }
  function listeningCard(track, index) {
    const block = el('article', { class: 'listening-card' });
    if (index !== undefined) block.append(p(`АУДИО ${String(index + 1).padStart(2, '0')} · RYAN`, 'audio-number'));
    else block.append(p('RYAN · BRITISH ENGLISH', 'eyebrow'));
    block.append(el('h2', {}, track.title), p(track.note, 'lede'));
    const transcript = el('div', { class: 'transcript', id: `transcript-${track.id}`, hidden: true }, english(track.text), p(track.translation, 'translation'));
    const toggle = button('Открыть текст', () => { transcript.hidden = !transcript.hidden; toggle.setAttribute('aria-expanded', String(!transcript.hidden)); toggle.textContent = transcript.hidden ? 'Открыть текст' : 'Скрыть текст'; }, 'quiet', { 'aria-controls': transcript.id, 'aria-expanded': 'false' });
    block.append(el('div', { class: 'actions' }, audioButton(track.audioId, track.title), toggle), transcript);
    return block;
  }
  function renderListening() {
    queueKey = '';
    main.append(p('СЛУШАТЬ И ПОДХВАТЫВАТЬ ФРАЗЫ', 'eyebrow'), el('h1', {}, 'Английский на слух'), p('Сначала уловите смысл. Затем откройте текст и повторите полезную фразу за Ryan. Скорость можно изменить во время воспроизведения.', 'lede'), p('Синтетический голос · британский английский. Все ситуации и примеры придуманы для практики.', 'note'));
    const filter = el('select', { 'aria-label': 'Тема аудио', onchange: event => { listeningModule = event.target.value; listeningPage = 0; stopAudio(); render(); } });
    for (const [value, label] of [['all', 'Все темы'], ...modules.map(m => [m.id, m.title])]) filter.append(el('option', { value, selected: value === listeningModule ? '' : undefined }, label));
    main.append(el('label', { class: 'select-field listening-filter' }, 'Тема', filter));
    const tracks = allTracks.filter(t => listeningModule === 'all' || t.moduleId === listeningModule);
    const pageSize = 12, pages = Math.max(1, Math.ceil(tracks.length / pageSize));
    listeningPage = Math.min(listeningPage, pages - 1);
    const list = el('div', { class: 'audio-list' });
    tracks.slice(listeningPage * pageSize, (listeningPage + 1) * pageSize).forEach((t, i) => list.append(listeningCard(t, listeningPage * pageSize + i)));
    main.append(p(`${tracks.length} ${plural(tracks.length, ['запись', 'записи', 'записей'])} · страница ${listeningPage + 1} из ${pages}`, 'muted small'), list);
    if (pages > 1) main.append(el('div', { class: 'card-navigation' }, button('← Предыдущие записи', () => { listeningPage--; stopAudio(); render(true); }, '', { disabled: listeningPage === 0 ? '' : undefined }), button('Следующие записи →', () => { listeningPage++; stopAudio(); render(true); }, '', { disabled: listeningPage === pages - 1 ? '' : undefined })));
    if (tracks.some(t => !readyAudio.has(t.audioId))) main.prepend(p('Некоторые записи Ryan пока недоступны. Их тексты можно открыть ниже.', 'notice'));
  }
  function renderProgress() {
    queueKey = '';
    const records = Object.entries(progress.reviews);
    const due = records.filter(([, r]) => Core.status(r) === 'due').length;
    main.append(p('ВАШИ РЕШЕНИЯ О ПОВТОРЕНИИ', 'eyebrow'), el('h1', {}, 'Мой прогресс'), p('Здесь появляются только карточки, для которых вы сами выбрали дату следующего возвращения.', 'lede'));
    const stats = el('div', { class: 'stats' });
    for (const [n, title] of [[records.length, 'С датой повтора'], [due, 'Пора вернуться'], [allCards.length - records.length, 'Без даты']]) stats.append(el('div', { class: 'stat' }, el('strong', {}, n), el('span', {}, title)));
    main.append(stats);
    if (records.length) {
      const list = el('div', { class: 'progress-list' });
      records.sort((a, b) => Date.parse(a[1].due) - Date.parse(b[1].due)).forEach(([id, r]) => {
        const card = allCards.find(c => c.id === id);
        list.append(el('div', { class: 'progress-row' }, el('div', {}, english(card.answer), el('small', {}, `${card.moduleTitle} · ${r.repetitions} ${plural(r.repetitions, ['отметка', 'отметки', 'отметок'])}`)), el('div', { class: 'progress-date' }, Core.status(r) === 'due' ? 'Пора вернуться' : 'Следующий возврат', el('br'), dateLabel(r.due))));
      }); main.append(list);
    }
    main.append(el('section', { class: 'backup-panel' }, el('h2', {}, 'Сохранить свои отметки'), p('Прогресс хранится в этом браузере на этом устройстве. Сохраните файл, чтобы перенести отметки. При загрузке файла сохранятся более поздние даты ваших решений.'), el('div', { class: 'actions' }, button('Сохранить файл', exportProgress), button('Загрузить файл', () => document.getElementById('import-file').click()))));
    if (storageProblem) notice('Хранилище браузера недоступно или сохранённые данные повреждены. Текущие отметки можно сохранить в файл.');
  }
  function exportProgress() {
    const blob = new Blob([JSON.stringify({ ...progress, collection: 'english-photo-notes', exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = el('a', { href: url, download: 'english-photo-notes-progress.json' });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Файл слишком большой');
      const input = JSON.parse(await file.text());
      if (input.collection && input.collection !== 'english-photo-notes') throw new Error('Файл относится к другому сборнику');
      const imported = Core.validateState(input, ids);
      progress = Core.mergeStates(progress, imported); const saved = persist(); queueKey = '';
      render(); if (saved) notice('Отметки загружены. Для каждой карточки сохранено более позднее решение о повторении.');
    } catch (error) { notice(`Не удалось загрузить отметки: ${error instanceof SyntaxError ? 'файл не похож на JSON' : error.message}. Текущие отметки сохранены.`); }
    event.target.value = '';
  });
  function stopAudio() {
    audioToken += 1; audio.pause(); audio.removeAttribute('src'); audio.load(); currentAudio = null;
    document.getElementById('audio-player').hidden = true; document.body.classList.remove('has-audio');
  }
  async function playAudio(id, title) {
    if (!/^[a-z0-9-]+$/.test(id) || !readyAudio.has(id)) return;
    const token = ++audioToken; audio.pause();
    currentAudio = { id, title }; audio.src = `audio/${id}.mp3`; audio.playbackRate = Number(document.getElementById('audio-speed').value);
    document.getElementById('audio-player').hidden = false; document.body.classList.add('has-audio');
    document.getElementById('audio-title').textContent = title;
    document.getElementById('audio-status').textContent = 'Ryan · синтетический голос · British English';
    document.getElementById('audio-toggle').textContent = 'Загрузка';
    try { await audio.play(); if (token === audioToken) updateAudioState(); }
    catch (error) { if (token === audioToken && error.name !== 'AbortError') audioError(); }
  }
  function updateAudioState() {
    const target = document.getElementById('audio-toggle');
    target.textContent = audio.paused ? (audio.ended ? 'Сначала' : 'Продолжить') : 'Пауза';
    target.setAttribute('aria-label', audio.paused ? 'Воспроизвести аудио' : 'Пауза');
  }
  function audioError() {
    if (!currentAudio) return;
    document.getElementById('audio-toggle').textContent = 'Повторить';
    document.getElementById('audio-toggle').setAttribute('aria-label', 'Повторить загрузку аудио');
    document.getElementById('audio-status').textContent = 'Аудио недоступно';
    notice('Не удалось открыть запись Ryan. Проверьте, что приложение открыто из полной папки вместе с аудиофайлами. Текст доступен в карточке.');
  }
  document.getElementById('audio-toggle').addEventListener('click', async () => {
    if (!currentAudio) return;
    if (audio.error) { playAudio(currentAudio.id, currentAudio.title); return; }
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      try { await audio.play(); } catch (_) { audioError(); }
    } else audio.pause();
    updateAudioState();
  });
  document.getElementById('audio-close').addEventListener('click', stopAudio);
  document.getElementById('audio-speed').addEventListener('change', event => { audio.playbackRate = Number(event.target.value); });
  audio.addEventListener('ended', updateAudioState); audio.addEventListener('pause', () => { if (currentAudio) updateAudioState(); }); audio.addEventListener('play', updateAudioState); audio.addEventListener('error', audioError);
  if (typeof ResizeObserver === 'function') new ResizeObserver(entries => {
    document.documentElement.style.setProperty('--player-height', `${Math.ceil(entries[0].target.getBoundingClientRect().height) + 20}px`);
  }).observe(document.getElementById('audio-player'));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => route(`#${b.dataset.view}`)));
  window.addEventListener('hashchange', () => { stopAudio(); parseRoute(); render(true); window.scrollTo(0, 0); });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { progress = Core.mergeStates(progress, Core.validateState(JSON.parse(event.newValue), ids)); render(); } catch (_) { notice('Не удалось прочитать изменение прогресса из другой вкладки.'); }
  });
  parseRoute(); render();
  if (storageProblem) notice('Не удалось прочитать сохранённые отметки. Можно продолжить и сохранить новый прогресс в файл.');
})();

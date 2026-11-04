(() => {
  'use strict';
  const panel = document.getElementById('pwa-tools');
  if (!panel) return;
  const status = document.getElementById('pwa-status');
  const detail = document.getElementById('pwa-detail');
  const bar = document.getElementById('pwa-progress');
  const install = document.getElementById('pwa-install');
  const update = document.getElementById('pwa-update');
  const retry = document.getElementById('pwa-retry');
  const help = document.getElementById('pwa-help');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferredInstall = null, registration = null, hasReadyCopy = false, updateRequested = false, lastAnnounced = -1;
  install.hidden = standalone;
  const setStatus = (message, extra = '') => { status.textContent = message; detail.textContent = extra; };
  function showWaiting() {
    update.hidden = !registration?.waiting;
    if (!registration?.waiting) return;
    update.disabled = false;
    if (hasReadyCopy) setStatus('Готово без интернета', 'Доступно обновление. Ваш прогресс сохранится.');
  }
  function requestStatus(worker) { worker?.postMessage({type: 'PHOTO_PWA_STATUS'}); }
  function showFailure() {
    bar.hidden = true; retry.hidden = false;
    if (hasReadyCopy) setStatus('Готово без интернета', 'Обновление пока не загрузилось. Можно продолжать заниматься.');
    else setStatus('Офлайн-копия пока не готова', 'Подключитесь к интернету и повторите загрузку.');
  }
  function watchWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') showWaiting();
      if (worker.state === 'activated') { showWaiting(); requestStatus(worker); }
      if (worker.state === 'redundant') showFailure();
    });
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredInstall = event; install.textContent = 'Установить'; install.hidden = false;
  });
  window.addEventListener('appinstalled', () => { deferredInstall = null; install.hidden = true; help.hidden = true; });
  install.addEventListener('click', async () => {
    if (deferredInstall) {
      const prompt = deferredInstall; deferredInstall = null;
      await prompt.prompt(); await prompt.userChoice;
      install.textContent = 'Как установить';
    } else { help.hidden = !help.hidden; install.setAttribute('aria-expanded', String(!help.hidden)); }
  });
  update.addEventListener('click', () => {
    if (!registration?.waiting) return;
    updateRequested = true; update.disabled = true;
    registration.waiting.postMessage({type: 'SKIP_WAITING'});
  });
  retry.addEventListener('click', async () => {
    retry.hidden = true;
    setStatus('Загружаем офлайн-копию…', 'При первом открытии — около 15 МБ, включая весь голос Ryan.');
    try { registration ? await registration.update() : await register(); } catch (_) { showFailure(); }
  });
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') {
    setStatus('Карточки и аудио доступны', 'Для установки откройте ссылку приложения в браузере.');
    return;
  }
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data || {};
    if (msg.type === 'PHOTO_PWA_CACHE_PROGRESS' && Number.isFinite(msg.completed) && msg.total > 0) {
      bar.hidden = false; bar.max = msg.total; bar.value = msg.completed;
      const percent = Math.floor(msg.completed / msg.total * 100);
      if (percent !== lastAnnounced && (percent % 5 === 0 || percent === 100)) {
        lastAnnounced = percent;
        setStatus(hasReadyCopy ? `Загружаем обновление — ${percent}%` : `Сохраняем для офлайн-занятий — ${percent}%`, 'Карточки и весь голос Ryan · около 15 МБ при первом открытии');
      }
    }
    if (msg.type === 'PHOTO_PWA_STATUS' && msg.ready === false) { hasReadyCopy = false; showFailure(); }
    if (msg.type === 'PHOTO_PWA_READY') {
      hasReadyCopy = true; bar.hidden = true; retry.hidden = true;
      setStatus('Готово без интернета', 'Карточки и весь голос Ryan сохранены на этом устройстве.');
      showWaiting();
    }
    if (msg.type === 'PHOTO_PWA_CACHE_ERROR') showFailure();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    showWaiting();
    if (updateRequested) location.reload();
    else requestStatus(navigator.serviceWorker.controller);
  });
  async function register() {
    registration = await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
    watchWorker(registration.installing);
    registration.addEventListener('updatefound', () => watchWorker(registration.installing));
    requestStatus(registration.active); showWaiting();
    return registration;
  }
  setStatus('Загружаем офлайн-копию…', 'При первом открытии — около 15 МБ, включая весь голос Ryan.');
  register().catch(showFailure);
})();

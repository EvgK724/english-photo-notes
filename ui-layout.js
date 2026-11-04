/* Presentation only: readable system text and clearance for the bottom menu. */
(() => {
  'use strict';
  const root = document.documentElement;
  const dock = document.querySelector('.nav-dock');
  if (!dock) return;
  const nav = dock.querySelector('.main-nav');
  const labels = [...nav.querySelectorAll('.nav-label')];

  function measureDock() {
    const style = getComputedStyle(nav);
    const room = nav.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const fourColumnWidth = (room - 3 * parseFloat(style.columnGap)) / 4;
    const labelWidth = Math.max(...labels.map(label => label.getBoundingClientRect().width));
    nav.classList.toggle('two-rows', labelWidth + 10 > fourColumnWidth);
    root.style.setProperty('--nav-height', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
  }

  function applySystemTextSize() {
    let scale = 1;
    if (window.CSS && CSS.supports('font', '-apple-system-body')) {
      const probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'font:-apple-system-body;position:absolute;visibility:hidden;pointer-events:none';
      probe.textContent = 'x';
      document.body.append(probe);
      const size = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      if (Number.isFinite(size)) scale = Math.max(1, size / 17);
    }
    root.style.fontSize = `${112.5 * scale}%`;
    measureDock();
  }

  applySystemTextSize();
  if (typeof ResizeObserver === 'function') new ResizeObserver(measureDock).observe(dock);
  window.addEventListener('resize', applySystemTextSize);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applySystemTextSize();
  });
})();

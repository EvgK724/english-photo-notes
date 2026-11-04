/* Presentation only: readable system text and clearance for the bottom menu. */
(() => {
  'use strict';
  const root = document.documentElement;
  const dock = document.querySelector('.nav-dock');
  if (!dock) return;
  const nav = dock.querySelector('.main-nav');
  const labels = [...nav.querySelectorAll('.nav-label')];

  function measureDock() {
    const desired = parseFloat(getComputedStyle(root).fontSize) * .6875;
    const fits = labels.map(label => {
      const button = label.closest('button');
      const style = getComputedStyle(button);
      const available = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
      const width = label.getBoundingClientRect().width;
      return width ? parseFloat(getComputedStyle(label).fontSize) * available / width : desired;
    });
    const size = `${Math.max(12, Math.floor(Math.min(desired, ...fits) * 10) / 10)}px`;
    if (nav.style.getPropertyValue('--nav-label-size') !== size) nav.style.setProperty('--nav-label-size', size);
    const height = `${Math.ceil(dock.getBoundingClientRect().height)}px`;
    if (root.style.getPropertyValue('--nav-height') !== height) root.style.setProperty('--nav-height', height);
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
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(measureDock);
    observer.observe(dock);
    observer.observe(root);
  }
  window.addEventListener('resize', applySystemTextSize);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applySystemTextSize();
  });
})();

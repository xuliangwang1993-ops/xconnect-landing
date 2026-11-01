// Empty-canvas Factory OS home. Guide widget drives reveals via xc:factory-reveal.
(() => {
  const empty = document.getElementById('fbEmpty');
  const skip = document.getElementById('fbSkip');
  const layers = {
    intro: document.getElementById('fbIntro'),
    modules: document.getElementById('fbModules'),
    next: document.getElementById('fbNext'),
  };
  function show(id) {
    const el = layers[id];
    if (!el) return;
    el.hidden = false;
    el.classList.add('on');
    if (empty) empty.hidden = true;
    if (skip) skip.hidden = false;
  }
  function showAll() {
    Object.keys(layers).forEach(show);
    try { localStorage.setItem('xcFactoryHomeBuilt', '1'); } catch {}
  }
  window.addEventListener('xc:factory-reveal', (e) => {
    const step = e.detail && e.detail.step;
    if (step === 'all') showAll();
    else if (step) show(step);
  });
  skip?.addEventListener('click', () => {
    showAll();
    window.dispatchEvent(new CustomEvent('xc:factory-reveal', { detail: { step: 'all', source: 'skip' } }));
  });
  let built = false;
  try { built = !!localStorage.getItem('xcFactoryHomeBuilt'); } catch {}
  if (built || /[?&]full=1/.test(location.search)) showAll();
})();

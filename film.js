/* KAP cinematic scroll story — drives --p (0→1) per chapter and cross-fades frames.
   Transform/opacity only, rAF-throttled. Reduced-motion users get the static finished frames (CSS). */
(() => {
  'use strict';
  const chapters = [...document.querySelectorAll('.chapter')];
  if (!chapters.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);

  const state = chapters.map(ch => ({
    el: ch,
    kind: ch.dataset.chapter,
    frames: [...ch.querySelectorAll('.chapter__frame')],
    copy: ch.querySelector('.chapter__copy'),
    steps: [...ch.querySelectorAll('.chapter__steps li')],
    label: ch.querySelector('[data-on]'),
    on: null,
  }));

  function update(s, p) {
    s.el.style.setProperty('--p', p.toFixed(4));
    const n = s.frames.length;

    if (s.kind === 'lab') {
      // three assembly beats, cross-faded across the chapter
      const pos = clamp(p / 0.8) * (n - 1);
      s.frames.forEach((f, k) => {
        f.style.opacity = k === 0 ? 1 : smooth(clamp(pos - (k - 1)));
      });
      s.steps.forEach(li => li.classList.toggle('is-on', p >= parseFloat(li.dataset.at)));
      s.copy.style.setProperty('--in', 1);
    } else {
      // off → on: the switch happens in the middle of the chapter
      const t = smooth(clamp((p - 0.3) / 0.25));
      s.frames[1].style.opacity = t;
      s.copy.style.setProperty('--in', smooth(clamp((p - 0.05) / 0.2)).toFixed(3));
      const on = t > 0.6;
      if (on !== s.on) {
        s.on = on;
        s.el.classList.toggle('is-on', on);
        if (s.label) s.label.textContent = on ? s.label.dataset.on : s.label.dataset.off;
      }
    }
  }

  let ticking = false;
  function frame() {
    ticking = false;
    const vh = window.innerHeight;
    state.forEach(s => {
      const r = s.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) return; // off-screen: skip work
      const p = clamp(-r.top / Math.max(1, r.height - vh));
      update(s, p);
    });
    // header: transparent over the first chapter
    const first = chapters[0].getBoundingClientRect();
    document.documentElement.classList.toggle('film-top', first.bottom > 80);
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  frame();
})();

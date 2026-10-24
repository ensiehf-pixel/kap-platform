/* =========================================================
   KAP scroll story
   One meter, built in the KAP lab (hero), travels with scroll
   to a school classroom (lights on) and then to a factory
   (production line starts). Transform/opacity only; rAF-throttled.
   ========================================================= */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const docks = [...document.querySelectorAll('.kap-dock[data-dock]')]
    .sort((a, b) => a.dataset.dock - b.dataset.dock);
  const lab = document.getElementById('lab');
  if (!docks.length || reduce.matches) return;

  const scenes = docks.map(d => d.closest('.scene'));
  const BASE_W = 300;

  /* ---------- build the traveling meter ---------- */
  const meter = document.createElement('div');
  meter.className = 'kap-meter is-unbuilt';
  meter.setAttribute('aria-hidden', 'true');
  const src = 'assets/images/kap-meter.webp';
  meter.innerHTML = `
    <div class="kap-meter__shadow">
      <img class="kap-meter__part kap-meter__part--top" src="${src}" alt="">
      <img class="kap-meter__part kap-meter__part--body" src="${src}" alt="">
      <img class="kap-meter__part kap-meter__part--bottom" src="${src}" alt="">
    </div>
    <div class="kap-meter__screen">
      <div class="km-head"><span class="km-title">POINT 1</span><i class="km-dots"></i></div>
      <div class="km-row"><b>V</b><span data-k="v">0</span><small>V</small></div>
      <div class="km-row"><b>A</b><span data-k="a">0.0</span><small>A</small></div>
      <div class="km-row"><b>~</b><span data-k="p">0.00</span><small>kW</small></div>
      <div class="km-boot">KAP</div>
    </div>`;
  document.body.appendChild(meter);
  document.documentElement.classList.add('kap-anim');

  /* ---------- screen read-outs per stop ---------- */
  const READINGS = [
    { title: 'CALIBRATED', v: 230, a: 0.0, p: 0.00 },
    { title: 'CLASS 3B', v: 228, a: 5.4, p: 1.23 },
    { title: 'LINE 2', v: 398, a: 72.6, p: 48.6 },
  ];
  const fields = {
    title: meter.querySelector('.km-title'),
    v: meter.querySelector('[data-k="v"]'),
    a: meter.querySelector('[data-k="a"]'),
    p: meter.querySelector('[data-k="p"]'),
  };
  const shown = { v: 0, a: 0, p: 0 };
  let readingIdx = -1, countRaf = 0;
  function setReading(i) {
    if (i === readingIdx) return;
    readingIdx = i;
    const r = READINGS[i];
    fields.title.textContent = r.title;
    const from = { ...shown }, t0 = performance.now(), dur = 900;
    cancelAnimationFrame(countRaf);
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      shown.v = from.v + (r.v - from.v) * e;
      shown.a = from.a + (r.a - from.a) * e;
      shown.p = from.p + (r.p - from.p) * e;
      fields.v.textContent = Math.round(shown.v);
      fields.a.textContent = shown.a.toFixed(1);
      fields.p.textContent = shown.p.toFixed(2);
      if (k < 1) countRaf = requestAnimationFrame(tick);
    };
    countRaf = requestAnimationFrame(tick);
  }

  /* ---------- hero: assembled by the KAP team ---------- */
  const steps = lab ? [...lab.querySelectorAll('.lab__steps li')] : [];
  const timers = [];
  let built = false;
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  function finishBuild() {
    if (built) return;
    built = true;
    timers.forEach(clearTimeout);
    meter.classList.remove('is-unbuilt', 'is-booting');
    meter.classList.add('step-body', 'step-top', 'step-bottom');
    steps.forEach(s => s.classList.add('is-on'));
    if (lab) { lab.classList.remove('is-building'); lab.classList.add('is-done'); lab.querySelector('.lab__chip-text').textContent = 'ساخته شد — آمادهٔ نصب'; }
    setReading(0);
  }
  function startBuild() {
    if (lab) lab.classList.add('is-building');
    at(250, () => { steps[0]?.classList.add('is-on'); meter.classList.add('step-body'); });
    at(900, () => meter.classList.add('step-top'));
    at(1400, () => { meter.classList.add('step-bottom'); steps[1]?.classList.add('is-on'); });
    at(1900, () => { meter.classList.remove('is-unbuilt'); meter.classList.add('is-booting'); });
    at(2600, () => { meter.classList.remove('is-booting'); steps[2]?.classList.add('is-on'); finishBuild(); });
  }

  /* ---------- scroll → position ---------- */
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let ticking = false;

  function frame() {
    ticking = false;
    const vh = window.innerHeight, vw = window.innerWidth;
    const rects = docks.map(d => d.getBoundingClientRect());
    // anchor = viewport centre; stop i is "reached" when its dock centre crosses it
    const centers = rects.map(r => r.top + r.height / 2 - vh / 2); // <0 means dock above centre
    const hold = vh * 0.18;

    let i = 0, f = 0;
    for (let k = 0; k < docks.length - 1; k++) {
      const start = centers[k] + hold;      // dock k centre this far above the anchor → start leaving
      const end = centers[k + 1] - hold;    // dock k+1 centre this far below the anchor → arrived
      if (start >= 0) { i = k; f = 0; break; }
      if (end <= 0) { i = k + 1; f = 0; continue; }
      i = k; f = clamp(-start / (end - start), 0, 1); break;
    }

    const a = rects[i], b = rects[Math.min(i + 1, rects.length - 1)];
    const e = ease(f);
    let x = a.left + (b.left - a.left) * e;
    let y = a.top + (b.top - a.top) * e;
    const w = a.width + (b.width - a.width) * e;
    // flight: arc sideways, lift, tilt, slightly bigger mid-air
    const arc = Math.sin(Math.PI * f);
    x += arc * vw * 0.12 * (i % 2 ? -1 : 1);
    y -= arc * vh * 0.04;
    const scale = (w / BASE_W) * (1 + arc * 0.18);
    const rot = arc * (i % 2 ? 9 : -9);
    const hw = BASE_W / 2, hh = (BASE_W * 1193 / 560) / 2;
    meter.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)}) translate(${hw}px, ${hh}px) rotate(${rot.toFixed(2)}deg) translate(${-hw}px, ${-hh}px)`;

    // which stop is the meter at / heading to
    if (f === 0 || f > 0.97) { const stop = f > 0.97 ? i + 1 : i; if (built || stop > 0) setReading(stop); }
    if ((i > 0 || f > 0) && !built) finishBuild();

    // scenes stay powered once the meter has been installed there (reverses on scroll up)
    scenes.forEach((s, k) => {
      if (!s) return;
      const on = k < i + 1 ? true : (k === i + 1 && f > 0.97);
      if (s.classList.contains('is-on') !== on) {
        s.classList.toggle('is-on', on);
        const label = s.querySelector('[data-on]');
        if (label) label.textContent = on ? label.dataset.on : label.dataset.off;
      }
    });
  }

  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(request); docks.forEach(d => ro.observe(d)); }

  // start
  scenes.forEach(s => s && s.classList.remove('is-on'));
  frame();
  if (window.scrollY > window.innerHeight * 0.5) finishBuild(); else startBuild();
  window.addEventListener('scroll', () => { if (window.scrollY > 40) finishBuild(); }, { passive: true, once: true });

  // if the user switches on reduced motion mid-visit, fall back to the static story
  reduce.addEventListener?.('change', ev => {
    if (!ev.matches) return;
    meter.remove();
    document.documentElement.classList.remove('kap-anim');
    scenes.forEach(s => s && s.classList.add('is-on'));
  });
})();

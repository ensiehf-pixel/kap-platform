/* KAP cinematic scroll story.
   - Each chapter has a sticky full-screen photo stage; scroll progress p (0→1) drives frame cross-fades.
   - One real KAP meter (cut-out) flies between chapters like the bee: it lifts off the lab bench,
     lands on the classroom wall (lights turn on), lifts off again and lands in the factory (line starts).
   Transform/opacity only, rAF-throttled. Reduced motion: static finished frames (CSS). */
(() => {
  'use strict';
  const chapters = [...document.querySelectorAll('.chapter')];
  const traveler = document.getElementById('traveler');
  if (!chapters.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (traveler) traveler.hidden = true;
    return;
  }

  const IMG_W = 1536, IMG_H = 864;
  // where the meter body sits inside the cut-out image (fractions of its width/height)
  const CUT = { x0: 54 / 710, x1: 705 / 710, y0: 34 / 824, y1: 745 / 824, aspect: 696 / 600 };

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);
  const ramp = (p, a, b) => smooth(clamp((p - a) / (b - a)));

  const S = {};
  chapters.forEach(ch => {
    const frames = {};
    ch.querySelectorAll('.chapter__frame').forEach(f => { frames[f.dataset.f] = f; });
    S[ch.dataset.chapter] = {
      el: ch,
      stage: ch.querySelector('.chapter__stage'),
      box: ch.querySelector('.chapter__frames'),
      frames,
      copy: ch.querySelector('.chapter__copy'),
      steps: [...ch.querySelectorAll('.chapter__steps li')],
      label: ch.querySelector('[data-on]'),
      meter: (ch.dataset.meter || '').split(',').map(Number),
      on: null, p: 0,
    };
  });

  const progress = s => {
    const r = s.el.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - window.innerHeight));
  };

  // viewport rect of the meter body inside a chapter photo (object-fit: cover + push-in scale)
  function meterRect(s) {
    const box = s.box, r = box.getBoundingClientRect(); // transformed rect
    const cw = box.offsetWidth, ch = box.offsetHeight;
    const cs = getComputedStyle(box);
    const [fx, fy] = (cs.getPropertyValue('--focus') || '50% 50%').trim().split(/\s+/).map(v => parseFloat(v) / 100);
    const k = Math.max(cw / IMG_W, ch / IMG_H);
    const ox = (cw - IMG_W * k) * fx, oy = (ch - IMG_H * k) * fy;
    const scale = r.width / cw;                       // current push-in scale
    const originX = fx * cw, originY = fy * ch;
    const left0 = r.left + originX * (scale - 1); // untransformed box left in viewport
    const top0 = r.top + originY * (scale - 1);
    const map = (u, v) => [
      left0 + originX + (ox + u * k - originX) * scale,
      top0 + originY + (oy + v * k - originY) * scale,
    ];
    const [x0, y0, x1, y1] = s.meter;
    const a = map(x0, y0), b = map(x1, y1);
    return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] };
  }

  // place the cut-out so its body fits a target body rect (match height, centre horizontally)
  function travelerBox(t) {
    const h = t.h / (CUT.y1 - CUT.y0);
    const w = h / CUT.aspect;
    const bodyW = w * (CUT.x1 - CUT.x0);
    return { x: t.x + t.w / 2 - (w * CUT.x0 + bodyW / 2), y: t.y - h * CUT.y0, w, h };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  function setTraveler(box, opacity, arc = 0, dir = 1) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = box.x + arc * vw * 0.10 * dir;
    const y = box.y - arc * vh * 0.06;
    const sc = 1 + arc * 0.12;
    const rot = arc * -8 * dir;
    traveler.style.width = box.w.toFixed(1) + 'px';
    traveler.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    traveler.style.opacity = opacity.toFixed(3);
  }

  function setOn(s, on) {
    if (on === s.on) return;
    s.on = on;
    s.el.classList.toggle('is-on', on);
    if (s.label) s.label.textContent = on ? s.label.dataset.on : s.label.dataset.off;
  }

  const LAB_TAKEOFF = 0.82, LAND = 0.22, TAKEOFF = 0.8;

  let ticking = false;
  function frame() {
    ticking = false;
    const lab = S.lab, sch = S.school, fac = S.factory;
    [lab, sch, fac].forEach(s => { if (s) { s.p = progress(s); s.el.style.setProperty('--p', s.p.toFixed(4)); } });

    /* ---- lab: three assembly beats, then the meter is lifted off the bench ---- */
    if (lab) {
      const p = lab.p;
      lab.frames['2'].style.opacity = ramp(p, 0.08, 0.3);
      lab.frames['3'].style.opacity = ramp(p, 0.32, 0.55);
      lab.steps.forEach(li => li.classList.toggle('is-on', p >= parseFloat(li.dataset.at)));
      lab.el.style.setProperty('--dim', (ramp(p, 0.66, 0.86) * 0.82).toFixed(3));
    }
    /* ---- school & factory: empty → meter arrives → lights on (→ meter leaves) ---- */
    for (const s of [sch, fac]) {
      if (!s) continue;
      const p = s.p, f = s.frames;
      f.off.style.opacity = ramp(p, LAND, LAND + 0.04);
      f.on.style.opacity = ramp(p, 0.35, 0.55);
      if (f['empty-on']) f['empty-on'].style.opacity = ramp(p, TAKEOFF, TAKEOFF + 0.04);
      s.copy.style.setProperty('--in', ramp(p, 0.05, 0.25).toFixed(3));
      setOn(s, p > 0.45);
    }

    /* ---- the traveling meter ---- */
    if (!traveler || !lab || !sch) return;
    const vh = window.innerHeight;
    const docY = s => s.el.getBoundingClientRect().top + window.scrollY;
    const at = (s, p) => docY(s) + p * (s.el.offsetHeight - vh); // scrollY where chapter s reaches progress p
    const y = window.scrollY;

    const legs = [
      { from: lab, a: at(lab, LAB_TAKEOFF), to: sch, b: at(sch, LAND), dir: 1 },
      fac ? { from: sch, a: at(sch, TAKEOFF), to: fac, b: at(fac, LAND), dir: -1 } : null,
    ].filter(Boolean);

    let shown = false;
    // resting on the lab bench (fades in over the photo's meter, then becomes "the" meter)
    if (y < legs[0].a) {
      const o = ramp(lab.p, 0.6, 0.68);
      if (o > 0) { setTraveler(travelerBox(meterRect(lab)), o); shown = true; }
    }
    for (const L of legs) {
      if (y >= L.a && y <= L.b) {
        const t = smooth(clamp((y - L.a) / (L.b - L.a)));
        const A = travelerBox(meterRect(L.from)), B = travelerBox(meterRect(L.to));
        const box = { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), w: lerp(A.w, B.w, t), h: lerp(A.h, B.h, t) };
        // on landing, hand over to the photo's installed meter
        const o = L.to === sch || L.to === fac ? 1 - ramp(L.to.p, LAND, LAND + 0.04) : 1;
        setTraveler(box, Math.max(o, t < 1 ? 1 : 0), Math.sin(Math.PI * t), L.dir);
        shown = true;
      }
    }
    // waiting to take off from the school wall
    if (!shown && fac && sch.p >= TAKEOFF - 0.06 && y < legs[1].a) {
      setTraveler(travelerBox(meterRect(sch)), ramp(sch.p, TAKEOFF - 0.06, TAKEOFF - 0.01));
      shown = true;
    }
    // landing hand-over (after the leg ended)
    for (const s of [sch, fac]) {
      if (!shown && s && s.p >= LAND && s.p < LAND + 0.05) {
        setTraveler(travelerBox(meterRect(s)), 1 - ramp(s.p, LAND, LAND + 0.04));
        shown = true;
      }
    }
    if (!shown) traveler.style.opacity = 0;
  }

  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  window.addEventListener('load', request);
  frame();
})();

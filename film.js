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
      map: ch.querySelector('.nation__map'),
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

  // size the dot layer like the cover-fitted photo so dots stay on the city
  function fitMap(s) {
    const box = s.box, cw = box.offsetWidth, ch = box.offsetHeight;
    if (s._fit === cw + 'x' + ch) return; s._fit = cw + 'x' + ch;
    const [fx, fy] = (getComputedStyle(box).getPropertyValue('--focus') || '50% 50%').trim().split(/\s+/).map(v => parseFloat(v) / 100);
    const k = Math.max(cw / IMG_W, ch / IMG_H);
    Object.assign(s.map.style, { width: IMG_W * k + 'px', height: IMG_H * k + 'px', left: (cw - IMG_W * k) * fx + 'px', top: (ch - IMG_H * k) * fy + 'px' });
  }

  function setOn(s, on) {
    if (on === s.on) return;
    s.on = on;
    s.el.classList.toggle('is-on', on);
    if (s.label) s.label.textContent = on ? s.label.dataset.on : s.label.dataset.off;
  }


  /* ---- scroll-scrubbed video sequences (frames drawn on a canvas, object-fit: cover) ---- */
  const HD = window.innerWidth > 820 && (navigator.connection ? !navigator.connection.saveData : true);
  class Seq {
    constructor(canvas) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.name = canvas.dataset.seq; this.n = +canvas.dataset.count; this.rev = canvas.dataset.reverse === '1';
      this.imgs = new Array(this.n); this.loaded = false; this.cur = -1;
    }
    load() {
      if (this.loaded) return; this.loaded = true;
      const dir = `assets/seq/${this.name}/${HD ? 'hd' : 'sd'}/`;
      // first frame shown first, then the rest
      const order = [...Array(this.n).keys()];
      if (this.rev) order.reverse();
      order.forEach((i, k) => {
        const im = new Image(); im.decoding = 'async';
        im.onload = () => { this.imgs[i] = im; if (this.want === i || this.cur === -1) this.draw(this.want ?? i, true); };
        setTimeout(() => { im.src = dir + String(i + 1).padStart(3, '0') + '.webp'; }, k < 4 ? 0 : 30 + k * 6);
      });
    }
    size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(this.c.clientWidth * dpr), h = Math.round(this.c.clientHeight * dpr);
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; this.cur = -1; }
    }
    set(t) { // t: 0→1 along the clip
      let i = Math.round(clamp(t) * (this.n - 1)); if (this.rev) i = this.n - 1 - i;
      this.want = i; this.draw(i);
    }
    draw(i, force) {
      this.size();
      if (!force && i === this.cur) return;
      let im = this.imgs[i];
      if (!im) { for (let d = 1; d < this.n && !im; d++) im = this.imgs[i - d] || this.imgs[i + d]; }
      if (!im) return;
      const cw = this.c.width, ch = this.c.height, iw = im.naturalWidth, ih = im.naturalHeight;
      const [fx, fy] = (getComputedStyle(this.c).getPropertyValue('--focus') || '50% 50%').trim().split(/\s+/).map(v => parseFloat(v) / 100);
      const k = Math.max(cw / iw, ch / ih), dw = iw * k, dh = ih * k;
      this.ctx.drawImage(im, (cw - dw) * fx, (ch - dh) * fy, dw, dh);
      this.cur = i;
    }
  }
  const seqs = {};
  document.querySelectorAll('.chapter__seq').forEach(c => { seqs[c.dataset.seq] = new Seq(c); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const q = seqs[e.target.dataset.chapter]; if (q) q.load(); } }), { rootMargin: '150% 0px' });
    chapters.forEach(ch => io.observe(ch));
  } else Object.values(seqs).forEach(q => q.load());
  if (seqs.lab) seqs.lab.load();

  const LAB_TAKEOFF = 0.82, LAND = 0.22, TAKEOFF = 0.8;

  let ticking = false;
  function frame() {
    ticking = false;
    const lab = S.lab, sch = S.school, fac = S.factory;
    [lab, sch, fac, S.nation].forEach(s => { if (s) { s.p = progress(s); s.el.style.setProperty('--p', s.p.toFixed(4)); } });

    /* ---- lab: three assembly beats, then the meter is lifted off the bench ---- */
    if (lab) {
      const p = lab.p;
      if (seqs.lab) seqs.lab.set(clamp(p / 0.5));          // video: close-up of the screws → whole meter, display on
      lab.frames['3'].style.opacity = ramp(p, 0.5, 0.56);  // hand over to the still the meter lifts off from
      lab.steps.forEach(li => li.classList.toggle('is-on', p >= parseFloat(li.dataset.at)));
      lab.el.style.setProperty('--dim', (ramp(p, 0.66, 0.86) * 0.82).toFixed(3));
    }
    /* ---- school & factory: empty → meter arrives → lights on (→ meter leaves) ---- */
    for (const s of [sch, fac]) {
      if (!s) continue;
      const p = s.p, f = s.frames;
      f.off.style.opacity = ramp(p, LAND, LAND + 0.04);
      const q = seqs[s.el.dataset.chapter];
      if (q) { q.c.style.opacity = ramp(p, 0.26, 0.3); q.set(clamp((p - 0.3) / 0.42)); }   // video: display wakes, lights come on
      f.on.style.opacity = q ? ramp(p, 0.72, 0.76) : ramp(p, 0.35, 0.55);
      if (f['empty-on']) f['empty-on'].style.opacity = ramp(p, TAKEOFF, TAKEOFF + 0.04);
      s.copy.style.setProperty('--in', ramp(p, 0.05, 0.25).toFixed(3));
      setOn(s, p > 0.5);
    }

    /* ---- nation: crisis → the meter multiplies across the city → stable ---- */
    const nat = S.nation;
    if (nat) {
      const p = nat.p;
      nat.frames.stable.style.opacity = ramp(p, 0.42, 0.62);
      nat.copy.style.setProperty('--in', ramp(p, 0.05, 0.25).toFixed(3));
      if (nat.map) { fitMap(nat); nat.map.classList.toggle('is-lit', p > 0.3); }
      setOn(nat, p > 0.55);
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
      fac && S.nation ? { from: fac, a: at(fac, TAKEOFF), to: S.nation, b: at(S.nation, 0.28), dir: 1, vanish: true } : null,
    ].filter(Boolean);

    let shown = false;
    // resting on the lab bench (fades in over the photo's meter, then becomes "the" meter)
    if (y < legs[0].a) {
      const o = ramp(lab.p, 0.6, 0.68);
      if (o > 0) { setTraveler(travelerBox(meterRect(lab)), o); shown = true; }
    }
    // between chapters the meter "parks" at the side like a companion while the text scrolls by
    const vw = window.innerWidth;
    const parkW = vw >= 1300 ? Math.min(110, (vw - 1200) / 2 - 16) : 0;
    const park = { w: parkW || 60, h: (parkW || 60) * CUT.aspect, x: 12, y: vh * 0.5 - (parkW || 60) * CUT.aspect / 2 };
    const parkO = parkW > 40 ? 1 : 0;
    const FLY = vh * 0.8;
    for (const L of legs) {
      if (y < L.a || y > L.b) continue;
      const A = travelerBox(meterRect(L.from)), B = travelerBox(meterRect(L.to));
      const mix = (P, Q, t) => ({ x: lerp(P.x, Q.x, t), y: lerp(P.y, Q.y, t), w: lerp(P.w, Q.w, t), h: lerp(P.h, Q.h, t) });
      let box, o = 1, arc = 0;
      if (L.b - L.a < FLY * 2.2) {                       // short hop: one arc
        const t = smooth(clamp((y - L.a) / (L.b - L.a)));
        box = mix(A, B, t); arc = Math.sin(Math.PI * t);
        if (L.vanish) o = 1 - ramp(t, 0.8, 1);
      } else if (y < L.a + FLY) {                         // lift off → park
        const t = smooth(clamp((y - L.a) / FLY));
        box = mix(A, park, t); arc = Math.sin(Math.PI * t) * 0.6; o = lerp(1, parkO, ramp(t, 0.6, 1));
      } else if (y > L.b - FLY) {                         // park → land
        const t = smooth(clamp((y - (L.b - FLY)) / FLY));
        box = mix(park, B, t); arc = Math.sin(Math.PI * t) * 0.6; o = lerp(parkO, 1, ramp(t, 0, 0.4));
        if (L.vanish) o *= 1 - ramp(t, 0.8, 1);
      } else {                                            // parked, gently floating
        box = { ...park, y: park.y + Math.sin(y / 140) * 8 }; o = parkO;
      }
      setTraveler(box, o, arc, L.dir);
      shown = true;
    }
    // waiting to take off from the school wall
    if (!shown && fac && sch.p >= TAKEOFF - 0.06 && y < legs[1].a) {
      setTraveler(travelerBox(meterRect(sch)), ramp(sch.p, TAKEOFF - 0.06, TAKEOFF - 0.01));
      shown = true;
    }
    // a copy lifts off the factory cabinet (the installed one stays): the meter multiplies
    if (!shown && fac && S.nation && fac.p >= TAKEOFF - 0.06 && y < legs[legs.length - 1].a) {
      setTraveler(travelerBox(meterRect(fac)), ramp(fac.p, TAKEOFF - 0.06, TAKEOFF - 0.01));
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
  window.addEventListener('resize', () => { Object.values(seqs).forEach(q => { q.cur = -1; }); request(); }, { passive: true });
  window.addEventListener('load', request);
  frame();
})();

/* KAP cinematic scroll story
   - Chapters: sticky full-screen stages; scroll progress p (0→1) scrubs video frame sequences and photo cross-fades.
   - One real KAP meter travels through the whole page like the bee in the reference:
     lab bench → its place in the intro text → classroom wall → its place in "what KAP does"
     → factory cabinet → its place in the digital-economy section → over the city, where the film splits it into many.
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
  // the meter body inside the cut-out image (fractions); cut-out is 600 x 696
  const CUT = { x0: 54 / 710, x1: 705 / 710, y0: 34 / 824, y1: 745 / 824, aspect: 696 / 600 };

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);
  const ramp = (p, a, b) => smooth(clamp((p - a) / (b - a)));
  const lerp = (a, b, t) => a + (b - a) * t;
  const focusOf = el => (getComputedStyle(el).getPropertyValue('--focus') || '50% 50%').trim().split(/\s+/).map(v => parseFloat(v) / 100);

  /* ---------- chapters ---------- */
  const S = {};
  chapters.forEach(ch => {
    const frames = {};
    ch.querySelectorAll('.chapter__frame').forEach(f => { frames[f.dataset.f] = f; });
    S[ch.dataset.chapter] = {
      el: ch, box: ch.querySelector('.chapter__frames'), frames,
      copy: ch.querySelector('.chapter__copy'),
      steps: [...ch.querySelectorAll('.chapter__steps li')],
      label: ch.querySelector('[data-on]'),
      map: ch.querySelector('.nation__map'),
      meter: (ch.dataset.meter || '').split(',').map(Number),
      on: null, p: 0,
    };
  });
  const progress = s => { const r = s.el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - window.innerHeight)); };
  function setOn(s, on) {
    if (on === s.on) return; s.on = on;
    s.el.classList.toggle('is-on', on);
    if (s.label) s.label.textContent = on ? s.label.dataset.on : s.label.dataset.off;
  }

  /* ---------- scroll-scrubbed video sequences (AVIF frames on a canvas, cross-blended) ---------- */
  const HD = window.innerWidth > 820 && !(navigator.connection && navigator.connection.saveData);
  class Seq {
    constructor(c) {
      this.c = c; this.ctx = c.getContext('2d');
      this.name = c.dataset.seq; this.n = +c.dataset.count; this.rev = c.dataset.reverse === '1';
      this.imgs = new Array(this.n); this.loaded = false; this.key = '';
    }
    load() {
      if (this.loaded) return; this.loaded = true;
      const dir = `assets/seq/${this.name}/${HD ? 'hd' : 'sd'}/`;
      const order = [...Array(this.n).keys()]; if (this.rev) order.reverse();
      order.forEach((i, k) => {
        const im = new Image(); im.decoding = 'async';
        im.onload = () => { this.imgs[i] = im; this.key = ''; request(); };
        setTimeout(() => { im.src = dir + String(i + 1).padStart(3, '0') + '.avif?v=11'; }, k < 6 ? 0 : 20 + k * 8);
      });
    }
    near(i) { for (let d = 0; d < this.n; d++) { const a = this.imgs[i - d] || this.imgs[i + d]; if (a) return a; } return null; }
    set(t) { // t: 0→1 along the clip; blends neighbouring frames for smooth motion
      let f = clamp(t) * (this.n - 1); if (this.rev) f = this.n - 1 - f;
      const i = Math.floor(f), j = Math.min(this.n - 1, i + 1), a = f - i;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(this.c.clientWidth * dpr), h = Math.round(this.c.clientHeight * dpr);
      const key = `${f.toFixed(2)}|${w}x${h}`; if (key === this.key) return;
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
      const A = this.imgs[i] || this.near(i), B = this.imgs[j];
      if (!A) return;
      this.draw(A, 1);
      if (B && B !== A && a > 0.02) this.draw(B, a);
      this.key = key;
    }
    draw(im, alpha) {
      const cw = this.c.width, ch = this.c.height, iw = im.naturalWidth, ih = im.naturalHeight;
      const [fx, fy] = focusOf(this.c);
      const k = Math.max(cw / iw, ch / ih), dw = iw * k, dh = ih * k;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(im, (cw - dw) * fx, (ch - dh) * fy, dw, dh);
      this.ctx.globalAlpha = 1;
    }
  }
  const seqs = {};
  document.querySelectorAll('.chapter__seq').forEach(c => { seqs[c.dataset.seq] = new Seq(c); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const q = seqs[e.target.dataset.chapter]; if (q) q.load(); } }), { rootMargin: '200% 0px' });
    chapters.forEach(ch => io.observe(ch));
  } else Object.values(seqs).forEach(q => q.load());
  if (seqs.lab) seqs.lab.load();

  /* ---------- geometry ---------- */
  // viewport rect of the meter body inside a chapter photo (object-fit: cover + push-in scale)
  function meterRect(s) {
    const box = s.box, r = box.getBoundingClientRect();
    const cw = box.offsetWidth, ch = box.offsetHeight, [fx, fy] = focusOf(box);
    const k = Math.max(cw / IMG_W, ch / IMG_H), ox = (cw - IMG_W * k) * fx, oy = (ch - IMG_H * k) * fy;
    const sc = r.width / cw, oX = fx * cw, oY = fy * ch;
    const left0 = r.left + oX * (sc - 1), top0 = r.top + oY * (sc - 1);
    const map = (u, v) => [left0 + oX + (ox + u * k - oX) * sc, top0 + oY + (oy + v * k - oY) * sc];
    const [x0, y0, x1, y1] = s.meter, a = map(x0, y0), b = map(x1, y1);
    return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] };
  }
  // cut-out box whose meter body fits a target body rect (match height, centre horizontally)
  function bodyFit(t) {
    const h = t.h / (CUT.y1 - CUT.y0), w = h / CUT.aspect, bodyW = w * (CUT.x1 - CUT.x0);
    return { x: t.x + t.w / 2 - (w * CUT.x0 + bodyW / 2), y: t.y - h * CUT.y0, w, h };
  }
  function fitMap(s) { // dot layer sized like the cover-fitted photo
    const box = s.box, cw = box.offsetWidth, ch = box.offsetHeight;
    if (s._fit === cw + 'x' + ch) return; s._fit = cw + 'x' + ch;
    const [fx, fy] = focusOf(box), k = Math.max(cw / IMG_W, ch / IMG_H);
    Object.assign(s.map.style, { width: IMG_W * k + 'px', height: IMG_H * k + 'px', left: (cw - IMG_W * k) * fx + 'px', top: (ch - IMG_H * k) * fy + 'px' });
  }
  function setTraveler(b, opacity, arc = 0, dir = 1) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = b.x + arc * vw * 0.08 * dir, y = b.y - arc * vh * 0.05;
    traveler.style.width = b.w.toFixed(1) + 'px';
    traveler.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(arc * -7 * dir).toFixed(2)}deg) scale(${(1 + arc * 0.1).toFixed(3)})`;
    traveler.style.opacity = opacity.toFixed(3);
  }

  /* ---------- timing (chapter progress) ---------- */
  const T = {
    lab: { video: [0, 0.6], still: [0.6, 0.66], show: [0.7, 0.76], dim: [0.76, 0.9], out: 0.92 },
    room: { land: 0.1, handoff: 0.04, video: [0.16, 0.88], out: 0.94 },
    nation: { land: 0.12, handoff: 0.03, video: [0.15, 0.8], stable: [0.8, 0.86], on: 0.6 },
  };

  /* ---------- the route: stops the meter rests at, in page order ---------- */
  const slots = [...document.querySelectorAll('.meter-slot')].sort((a, b) => a.dataset.slot - b.dataset.slot);
  const docTop = el => el.getBoundingClientRect().top + window.scrollY;
  const at = (s, p) => docTop(s.el) + p * (s.el.offsetHeight - window.innerHeight);
  function route() {
    const vh = window.innerHeight, R = [];
    const ch = (s, a, b, extra = {}) => { if (s) R.push({ kind: 'ch', s, in: a, out: b, ...extra }); };
    const sl = el => {
      if (!el) return;
      const r = el.getBoundingClientRect(), c = r.top + window.scrollY + r.height / 2 - vh / 2;
      R.push({ kind: 'slot', el, in: c - vh * 0.14, out: c + vh * 0.14 });
    };
    ch(S.lab, -Infinity, at(S.lab, T.lab.out), { start: true });
    sl(slots[0]);
    ch(S.school, at(S.school, T.room.land), at(S.school, T.room.out));
    sl(slots[1]);
    ch(S.factory, at(S.factory, T.room.land), at(S.factory, T.room.out));
    sl(slots[2]);
    ch(S.nation, at(S.nation, T.nation.land), at(S.nation, 1) + vh * 50, { end: true });
    return R;
  }
  const rectOf = st => {
    if (st.kind === 'slot') { const r = st.el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    return bodyFit(meterRect(st.s));
  };
  const mix = (P, Q, t) => ({ x: lerp(P.x, Q.x, t), y: lerp(P.y, Q.y, t), w: lerp(P.w, Q.w, t), h: lerp(P.h, Q.h, t) });

  /* ---------- frame ---------- */
  let ticking = false;
  function frame() {
    ticking = false;
    const vh = window.innerHeight, vw = window.innerWidth;
    Object.values(S).forEach(s => { s.p = progress(s); s.el.style.setProperty('--p', s.p.toFixed(4)); });

    // lab: video (close-up of the screws → whole meter), then the still it lifts off from
    const lab = S.lab;
    if (lab) {
      const p = lab.p, L = T.lab;
      if (seqs.lab) seqs.lab.set((p - L.video[0]) / (L.video[1] - L.video[0]));
      if (lab.frames['3']) lab.frames['3'].style.opacity = ramp(p, ...L.still);
      lab.steps.forEach(li => li.classList.toggle('is-on', p >= parseFloat(li.dataset.at)));
      lab.el.style.setProperty('--dim', (ramp(p, ...L.dim) * 0.82).toFixed(3));
      if (lab.copy) lab.copy.style.setProperty('--in', (1 - ramp(p, L.show[0] - 0.02, L.dim[0] + 0.04)).toFixed(3)); // text steps aside as the meter lifts off
    }
    // classroom & factory: empty wall → meter lands → video (display wakes, lights come on, more light)
    for (const s of [S.school, S.factory]) {
      if (!s) continue;
      const p = s.p, R = T.room, f = s.frames, q = seqs[s.el.dataset.chapter];
      f.off.style.opacity = ramp(p, R.land, R.land + R.handoff);
      if (q) { q.c.style.opacity = ramp(p, R.land + R.handoff, R.video[0]); q.set((p - R.video[0]) / (R.video[1] - R.video[0])); }
      f.on.style.opacity = q ? ramp(p, R.video[1], R.video[1] + 0.03) : ramp(p, 0.35, 0.55);
      if (f['empty-on']) f['empty-on'].style.opacity = ramp(p, R.out - 0.02, R.out + 0.01); // the meter leaves the wall
      s.copy.style.setProperty('--in', ramp(p, 0.04, 0.16).toFixed(3));
      setOn(s, p > 0.45);
    }
    // nation: crisis → the meter multiplies across the city → stable
    const nat = S.nation;
    if (nat) {
      const p = nat.p, N = T.nation;
      const q = seqs.nation;
      if (q) { q.c.style.opacity = ramp(p, N.land, N.land + N.handoff); q.set((p - N.video[0]) / (N.video[1] - N.video[0])); }
      nat.frames.stable.style.opacity = ramp(p, ...N.stable);
      nat.copy.style.setProperty('--in', ramp(p, 0.04, 0.18).toFixed(3));
      setOn(nat, p > N.on);
    }

    /* ---- the traveling meter: never disappears between stops ---- */
    if (!traveler) return;
    const y = window.scrollY, R = route(), FLY = vh * 0.75;
    // long gaps: it waits beside the text (wide screens) or in the corner (small screens), gently floating
    // long gaps: it waits on the left side of the screen, vertically centred, gently floating
    const pw = vw >= 1024 ? Math.min(180, Math.max(130, vw * 0.1)) : Math.max(96, Math.min(140, vw * 0.27));
    const park = { w: pw, h: pw * CUT.aspect, x: vw >= 1300 ? Math.max(16, (vw - 1200) / 2 - pw - 12) : 12, y: vh * 0.5 - pw * CUT.aspect / 2 };
    let done = false;

    for (let i = 0; i < R.length && !done; i++) {
      const st = R[i];
      if (y >= st.in && y <= st.out) {                                   // resting at a stop
        if (st.kind === 'slot') setTraveler(rectOf(st), 1);
        else if (st.start) setTraveler(rectOf(st), ramp(lab.p, ...T.lab.show));
        else if (st.end) setTraveler(rectOf(st), 1 - ramp(y, st.in, st.in + (st.s.el.offsetHeight - vh) * 0.03));
        else {                                                           // installed in the scene: the film shows it
          const fade = (st.s.el.offsetHeight - vh) * 0.035;
          setTraveler(rectOf(st), Math.max(1 - ramp(y, st.in, st.in + fade), ramp(y, st.out - fade, st.out)));
        }
        done = true;
      } else if (i < R.length - 1 && y > st.out && y < R[i + 1].in) {   // flying to the next stop
        const nx = R[i + 1], A = rectOf(st), B = rectOf(nx), dist = nx.in - st.out, dir = i % 2 ? -1 : 1;
        let box, arc, o = 1, t = 0;
        if (dist < FLY * 2.4) {
          t = smooth(clamp((y - st.out) / dist)); box = mix(A, B, t); arc = Math.sin(Math.PI * t);
        } else if (y < st.out + FLY) {
          t = smooth(clamp((y - st.out) / FLY)); box = mix(A, park, t); arc = Math.sin(Math.PI * t) * 0.6;
        } else if (y > nx.in - FLY) {
          t = smooth(clamp((y - (nx.in - FLY)) / FLY)); box = mix(park, B, t); arc = Math.sin(Math.PI * t) * 0.6;
        } else {
          box = { ...park, y: park.y + Math.sin(y / 160) * 6 }; arc = 0;
        }
        setTraveler(box, o, arc, dir);
        done = true;
      }
    }
    if (!done) traveler.style.opacity = 0;
  }

  function request() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', () => { Object.values(seqs).forEach(q => { q.key = ''; }); Object.values(S).forEach(s => { s._fit = ''; }); request(); }, { passive: true });
  window.addEventListener('load', request);
  frame();
})();

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
      track: ch.dataset.track ? JSON.parse(ch.dataset.track) : null, // the meter's place in every frame of the film
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
        setTimeout(() => { im.src = dir + String(i + 1).padStart(3, '0') + '.avif?v=16'; }, k < 6 ? 0 : 20 + k * 8);
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
  // where the meter sits in the film at video progress vt (follows the camera), with its light and screen state
  function trackAt(s, vt) {
    const t = s.track; if (!t) return { r: s.meter, l: 1 };
    const f = clamp(vt) * (t.n - 1) / t.step, i = Math.min(t.r.length - 1, Math.floor(f)), j = Math.min(t.r.length - 1, i + 1), a = f - i;
    return { r: t.r[i].map((v, k) => lerp(v, t.r[j][k], a)), l: lerp(t.l[i], t.l[j], a) };
  }
  function meterRect(s, m = s.meter) {
    const box = s.box, r = box.getBoundingClientRect();
    const cw = box.offsetWidth, ch = box.offsetHeight, [fx, fy] = focusOf(box);
    const k = Math.max(cw / IMG_W, ch / IMG_H), ox = (cw - IMG_W * k) * fx, oy = (ch - IMG_H * k) * fy;
    const sc = r.width / cw, oX = fx * cw, oY = fy * ch;
    const left0 = r.left + oX * (sc - 1), top0 = r.top + oY * (sc - 1);
    const map = (u, v) => [left0 + oX + (ox + u * k - oX) * sc, top0 + oY + (oy + v * k - oY) * sc];
    const [x0, y0, x1, y1] = m, a = map(x0, y0), b = map(x1, y1);
    return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] };
  }
  // cut-out box whose meter body fits a target body rect (match height, centre horizontally)
  // k (0→1): how far the cut-out is reshaped toward the scene meter's proportions (so it "sits" in its outline)
  const BODY_R = (CUT.x1 - CUT.x0) / ((CUT.y1 - CUT.y0) * CUT.aspect); // body width / height of the cut-out
  function bodyFit(t, k = 0) {
    const bodyH = t.h, bodyW = lerp(bodyH * BODY_R, t.w, k);
    const w = bodyW / (CUT.x1 - CUT.x0), h = bodyH / (CUT.y1 - CUT.y0);
    return { x: t.x + t.w / 2 - (w * CUT.x0 + bodyW / 2), y: t.y - h * CUT.y0, w, h };
  }
  function fitMap(s) { // dot layer sized like the cover-fitted photo
    const box = s.box, cw = box.offsetWidth, ch = box.offsetHeight;
    if (s._fit === cw + 'x' + ch) return; s._fit = cw + 'x' + ch;
    const [fx, fy] = focusOf(box), k = Math.max(cw / IMG_W, ch / IMG_H);
    Object.assign(s.map.style, { width: IMG_W * k + 'px', height: IMG_H * k + 'px', left: (cw - IMG_W * k) * fx + 'px', top: (ch - IMG_H * k) * fy + 'px' });
  }
  // bright: matches the cut-out to the scene's light; shadow: 1 in the air, 0 once it sits flat on the wall
  // the same meter with its screen off, laid over the traveler; shown while it is installed and not yet powered
  const travelerOff = traveler ? traveler.cloneNode() : null;
  if (travelerOff) { travelerOff.removeAttribute('id'); travelerOff.src = traveler.src.replace('kap-meter-a4.webp', 'kap-meter-a4-off.webp'); travelerOff.alt = ''; traveler.after(travelerOff); }
  function setTraveler(b, opacity, arc = 0, dir = 1, bright = 1, shadow = 1, press = 0, screenOff = 0) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = b.x + arc * vw * 0.08 * dir, y = b.y - arc * vh * 0.05;
    traveler.style.width = b.w.toFixed(1) + 'px';
    traveler.style.height = b.h.toFixed(1) + 'px';
    traveler.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(arc * -7 * dir).toFixed(2)}deg) scale(${(1 + arc * 0.1 + press).toFixed(3)})`;
    traveler.style.opacity = opacity.toFixed(3);
    traveler.style.filter = `brightness(${bright.toFixed(3)}) saturate(${(0.5 + 0.5 * shadow).toFixed(3)}) drop-shadow(0 ${(4 + 18 * shadow).toFixed(1)}px ${(8 + 26 * shadow).toFixed(1)}px rgba(0,0,0,${(0.25 + 0.2 * shadow).toFixed(2)}))`;
    if (travelerOff) {
      ['width', 'height', 'transform', 'filter'].forEach(k => { travelerOff.style[k] = traveler.style[k]; });
      travelerOff.style.opacity = (opacity * screenOff).toFixed(3);
    }
  }

  /* ---------- timing (chapter progress) ---------- */
  const T = {
    lab: { video: [0, 0.6], still: [0.6, 0.66], show: [0.7, 0.76], dim: [0.76, 0.9], out: 0.92 },
    // land: arrives on its spot · sit: settles onto the wall, takes the room's light, screen off until the power comes on
    // swap: it has taken the exact outline and light of the film's meter, and the film's meter takes over in that instant
    room: { land: 0.08, swap: 0.13, video: [0.15, 0.9], out: 0.95 },
    // office: the meter lifts off before the cut to the meeting room, and waits beside the page while it goes dark
    org: { land: 0.08, swap: 0.13, video: [0.15, 0.9], out: 0.44 },
    // nation: the film's first frame is this same meter over the city, so it hands over in place and the film splits it
    nation: { land: 0.1, sit: 0.15, swap: 0.16, video: [0.16, 0.8], stable: [0.8, 0.86], on: 0.6 },
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
    ch(S.org, at(S.org, T.org.land), at(S.org, T.org.out));
    sl(slots[2]);
    ch(S.nation, at(S.nation, T.nation.land), at(S.nation, 1) + vh * 50, { end: true });
    R.forEach(st => { if (st.kind === 'ch' && !st.start) st.T = st.end ? T.nation : (T[st.s.el.dataset.chapter] || T.room); });
    return R;
  }
  const rectOf = st => {
    if (st.kind === 'slot') { const r = st.el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    if (st.start || st.end) return bodyFit(meterRect(st.s), 0);
    const C = st.T, P = st.s.p, vt = (P - C.video[0]) / (C.video[1] - C.video[0]);
    const m = meterRect(st.s, trackAt(st.s, vt).r);
    // reshapes into the film meter's outline while it settles, and back to its own shape as it lifts off
    const k = P < C.video[0] ? lerp(SHAPE, 1, ramp(P, C.land, C.swap)) : lerp(1, SHAPE, ramp(P, C.out - 0.03, C.out));
    return bodyFit(m, k);
  };
  const SHAPE = 0.3;
  const NATION_LIGHT = 0.78;
  const mix = (P, Q, t) => ({ x: lerp(P.x, Q.x, t), y: lerp(P.y, Q.y, t), w: lerp(P.w, Q.w, t), h: lerp(P.h, Q.h, t) });

  const portraitMQ = window.matchMedia('(orientation: portrait)');
  const portrait = () => portraitMQ.matches; // phones / upright tablets: text stays visible under the film

  // phones / upright tablets: centre the film + text block vertically so no empty band is left under the text
  function layoutPortrait() {
    Object.values(S).forEach(s => {
      if (!portrait()) { s.el.style.removeProperty('--film-top'); return; }
      const st = s.el.querySelector('.chapter__stage'), cp = s.copy;
      const head = window.innerWidth <= 768 ? 64 : 68, filmH = s.box.offsetHeight, gap = 22;
      let textH = 0; [...cp.children].forEach(c => { const r = c.getBoundingClientRect(), m = getComputedStyle(c); textH += r.height + parseFloat(m.marginTop) + parseFloat(m.marginBottom); });
      const top = Math.max(head, head + (st.clientHeight - head - filmH - gap - textH - 24) / 2);
      s.el.style.setProperty('--film-top', Math.round(top) + 'px');
    });
  }

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
      if (lab.copy) lab.copy.style.setProperty('--in', portrait() ? '1' : (1 - ramp(p, L.show[0] - 0.02, L.dim[0] + 0.04)).toFixed(3)); // text steps aside as the meter lifts off
    }
    // classroom & factory: empty wall → meter lands → video (display wakes, lights come on, more light)
    for (const s of [S.school, S.factory, S.org]) {
      if (!s) continue;
      const p = s.p, R = T[s.el.dataset.chapter] || T.room, f = s.frames, q = seqs[s.el.dataset.chapter];
      f.off.style.opacity = p >= R.swap ? 1 : 0;      // the film's meter appears exactly when the flying one hands over
      if (q) { q.c.style.opacity = p >= R.swap ? 1 : 0; q.set((p - R.video[0]) / (R.video[1] - R.video[0])); }
      f.on.style.opacity = q ? ramp(p, R.video[1], R.video[1] + 0.03) : ramp(p, 0.35, 0.55);
      if (f['empty-on']) f['empty-on'].style.opacity = ramp(p, R.out - 0.02, R.out + 0.01); // the meter leaves the wall
      s.copy.style.setProperty('--in', portrait() ? '1' : ramp(p, 0.04, 0.16).toFixed(3));
      setOn(s, p > (s === S.org ? 0.6 : 0.45));
    }
    // nation: crisis → the meter multiplies across the city → stable
    const nat = S.nation;
    if (nat) {
      const p = nat.p, N = T.nation;
      const q = seqs.nation;
      if (q) { q.c.style.opacity = ramp(p, N.land, N.sit); q.set((p - N.video[0]) / (N.video[1] - N.video[0])); }
      nat.frames.stable.style.opacity = ramp(p, ...N.stable);
      nat.copy.style.setProperty('--in', portrait() ? '1' : ramp(p, 0.04, 0.18).toFixed(3));
      setOn(nat, p > N.on);
    }

    /* ---- the traveling meter: never disappears between stops ---- */
    if (!traveler) return;
    const y = window.scrollY, R = route(), FLY = vh * 0.75;
    // long gaps: it waits beside the text (wide screens) or in the corner (small screens), gently floating
    // long gaps: it waits on the left side of the screen, vertically centred, gently floating
    const pw = vw >= 1024 ? Math.min(180, Math.max(130, vw * 0.1)) : Math.max(96, Math.min(140, vw * 0.27));
    const park0 = { w: pw, h: pw * CUT.aspect, x: vw >= 1300 ? Math.max(16, (vw - 1200) / 2 - pw - 12) : 12, y: vh * 0.5 - pw * CUT.aspect / 2 };
    let done = false;

    for (let i = 0; i < R.length && !done; i++) {
      const st = R[i];
      if (y >= st.in && y <= st.out) {                                   // resting at a stop
        if (st.kind === 'slot') setTraveler(rectOf(st), 1);
        else if (st.start) setTraveler(rectOf(st), ramp(lab.p, ...T.lab.show));
        else if (st.end) {                                               // over the city: hands over to the film, which splits it
          const P = st.s.p, C = st.T, sit = ramp(P, C.land, C.sit);
          setTraveler(rectOf(st), P < C.swap ? 1 : 0, 0, 1, lerp(1, NATION_LIGHT, sit), 1 - sit * 0.5, Math.sin(Math.PI * sit) * 0.02);
        } else {                                                         // lands, takes the film meter's place, then the film carries on
          const P = st.s.p, C = st.T, vt = clamp((P - C.video[0]) / (C.video[1] - C.video[0])), tr = trackAt(st.s, vt);
          if (P < C.swap) {                                              // settling: outline, light and dark screen match the film's meter
            const sit = ramp(P, C.land, C.swap);
            setTraveler(rectOf(st), 1, 0, 1, lerp(1, tr.l, sit), 1 - sit, Math.sin(Math.PI * sit) * 0.02, sit);
          } else if (P > C.out - 0.03) {                                 // a new one lifts off the wall for the next stop
            const up = ramp(P, C.out - 0.03, C.out);
            setTraveler(rectOf(st), 1, 0, 1, lerp(tr.l, 1, up), up, 0, 0);
          } else { traveler.style.opacity = 0; if (travelerOff) travelerOff.style.opacity = 0; } // the film's own meter
        }
        done = true;
      } else if (i < R.length - 1 && y > st.out && y < R[i + 1].in) {   // flying to the next stop
        const nx = R[i + 1], A = rectOf(st), B = rectOf(nx), dist = nx.in - st.out, dir = i % 2 ? -1 : 1;
        // after the office the text sits on the left, so it waits on the right edge there
        const park = st.s === S.org && vw >= 1024 ? { ...park0, x: vw - park0.w - 16 } : park0;
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
    if (!done) { traveler.style.opacity = 0; if (travelerOff) travelerOff.style.opacity = 0; }
  }

  function request() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', () => { Object.values(seqs).forEach(q => { q.key = ''; }); Object.values(S).forEach(s => { s._fit = ''; }); request(); }, { passive: true });
  window.addEventListener('load', () => { layoutPortrait(); request(); });
  window.addEventListener('resize', layoutPortrait, { passive: true });
  layoutPortrait();
  frame();
})();

/* KAP catalogue gate: asks for name, mobile and email before the catalogue PDF opens.
   Leads go to Supabase (table catalogue_leads) when SUPABASE_URL and SUPABASE_KEY are set,
   otherwise (or if Supabase fails) to lead.php on the host, which emails info@kap.energy and keeps a CSV. */
(function () {
  var SUPABASE_URL = 'https://qdflrmecfarfufkltqxd.supabase.co';   // e.g. https://xxxx.supabase.co
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZmxybWVjZmFyZnVma2x0cXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjEzNTYsImV4cCI6MjEwODkzNzM1Nn0.a4NmtmGCDdLbdoqGgLvL9HjJQKtRA_1OfHXLlkaJK3c';   // the project's public "anon" key

  var me = document.currentScript && document.currentScript.src;
  var BASE = me ? me.replace(/[^\/]*$/, '') : '/';
  var EN = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
  var T = EN ? {
    t: 'Get the KAP catalogue', s: 'Enter your details and the catalogue opens right away.',
    n: 'Full name', p: 'Mobile number', e: 'Email', o: 'Organisation (optional)',
    b: 'Open the catalogue', w: 'Sending…', x: 'Close',
    en: 'Please enter your name.', ep: 'Please enter a valid mobile number.', ee: 'Please enter a valid email.',
    er: 'Something went wrong. Please try again.', ok: 'Thank you! The catalogue is opening.', l: 'If it did not open, tap here.'
  } : {
    t: 'دریافت کاتالوگ کاپ', s: 'مشخصات خود را وارد کنید تا کاتالوگ بلافاصله باز شود.',
    n: 'نام و نام خانوادگی', p: 'شمارهٔ همراه', e: 'ایمیل', o: 'سازمان (اختیاری)',
    b: 'مشاهدهٔ کاتالوگ', w: 'در حال ارسال…', x: 'بستن',
    en: 'لطفاً نام خود را وارد کنید.', ep: 'لطفاً شمارهٔ همراه معتبر وارد کنید.', ee: 'لطفاً ایمیل معتبر وارد کنید.',
    er: 'مشکلی پیش آمد؛ دوباره تلاش کنید.', ok: 'سپاس! کاتالوگ در حال باز شدن است.', l: 'اگر باز نشد، اینجا را بزنید.'
  };

  function done() { try { return localStorage.getItem('kapCatLead') === '1'; } catch (e) { return false; } }
  function mark() { try { localStorage.setItem('kapCatLead', '1'); } catch (e) {} }
  function digits(s) { return String(s).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }); }

  var css = '.kcg{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(20,24,28,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .25s}' +
    '.kcg.on{opacity:1}.kcg__box{position:relative;width:100%;max-width:420px;background:#FAFAFA;color:#20252B;border-radius:22px;padding:28px 24px 24px;box-shadow:0 30px 70px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;transform:translateY(12px);transition:transform .3s}' +
    '.kcg.on .kcg__box{transform:none}.kcg__box:before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#FF5A00,#FF008B)}' +
    '.kcg h3{margin:0 0 6px;font-size:1.25rem;font-weight:900}.kcg p.s{margin:0 0 18px;font-size:.9rem;color:#5E646B;line-height:1.8}' +
    '.kcg label{display:block;font-size:.8rem;font-weight:700;margin:10px 0 5px}.kcg input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #EAEAEA;border-radius:12px;background:#fff;font:inherit;font-size:.95rem;color:#20252B;outline:none;transition:border-color .2s,box-shadow .2s}' +
    '.kcg input:focus{border-color:#00E5D7;box-shadow:0 0 0 3px rgba(0,229,215,.18)}.kcg input[type=tel],.kcg input[type=email]{direction:ltr;text-align:start}' +
    '.kcg button[type=submit]{margin-top:18px;width:100%;padding:13px;border:0;border-radius:12px;background:#FF5A00;color:#fff;font:inherit;font-weight:800;font-size:1rem;cursor:pointer}.kcg button[type=submit]:disabled{opacity:.6}' +
    '.kcg__x{position:absolute;top:12px;inset-inline-end:12px;width:34px;height:34px;border:0;border-radius:50%;background:#EAEAEA;color:#20252B;font-size:18px;cursor:pointer;line-height:1}' +
    '.kcg__m{min-height:1.2em;margin-top:10px;font-size:.85rem;color:#c0392b}.kcg__m.ok{color:#0a8f86}.kcg__m a{color:#FF5A00;font-weight:700}' +
    '.kcg__hp{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}';

  function open(url) {
    if (!document.getElementById('kcg-css')) { var st = document.createElement('style'); st.id = 'kcg-css'; st.textContent = css; document.head.appendChild(st); }
    var w = document.createElement('div');
    w.className = 'kcg'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-labelledby', 'kcg-t');
    w.innerHTML = '<form class="kcg__box" novalidate dir="' + (EN ? 'ltr' : 'rtl') + '">' +
      '<button type="button" class="kcg__x" aria-label="' + T.x + '">×</button>' +
      '<h3 id="kcg-t">' + T.t + '</h3><p class="s">' + T.s + '</p>' +
      '<label for="kcg-n">' + T.n + '</label><input id="kcg-n" name="name" autocomplete="name" required maxlength="80">' +
      '<label for="kcg-p">' + T.p + '</label><input id="kcg-p" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxxx" required maxlength="20">' +
      '<label for="kcg-e">' + T.e + '</label><input id="kcg-e" name="email" type="email" autocomplete="email" placeholder="name@example.com" required maxlength="100">' +
      '<label for="kcg-o">' + T.o + '</label><input id="kcg-o" name="org" autocomplete="organization" maxlength="120">' +
      '<div class="kcg__hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>' +
      '<button type="submit">' + T.b + '</button><div class="kcg__m" aria-live="polite"></div></form>';
    document.body.appendChild(w);
    var f = w.querySelector('form'), m = w.querySelector('.kcg__m'), btn = f.querySelector('button[type=submit]');
    function close() { w.classList.remove('on'); setTimeout(function () { w.remove(); }, 250); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', esc);
    w.addEventListener('click', function (e) { if (e.target === w) close(); });
    w.querySelector('.kcg__x').addEventListener('click', close);
    requestAnimationFrame(function () { w.classList.add('on'); f.name.focus(); });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (f.website.value) return;
      var d = {
        name: f.name.value.trim().replace(/\s+/g, ' '),
        phone: digits(f.phone.value).replace(/[^\d+]/g, ''),
        email: f.email.value.trim(),
        org: f.org.value.trim() || null,
        source: 'catalogue-' + (EN ? 'en' : 'fa'),
        page: location.pathname
      };
      m.className = 'kcg__m';
      if (d.name.length < 2) { m.textContent = T.en; f.name.focus(); return; }
      if (!/^\+?\d{10,15}$/.test(d.phone)) { m.textContent = T.ep; f.phone.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) { m.textContent = T.ee; f.email.focus(); return; }
      btn.disabled = true; btn.textContent = T.w;
      // Open a tab now (inside the click) so pop-up blockers allow it; point it at the PDF once saved.
      var tab = window.open('', '_blank');
      send(d).then(function () {
        mark();
        if (tab) tab.location.href = url; else location.href = url;
        m.className = 'kcg__m ok'; m.innerHTML = T.ok + ' <a href="' + url + '" target="_blank" rel="noopener">' + T.l + '</a>';
        btn.textContent = T.b; setTimeout(close, 4000);
      }).catch(function () {
        if (tab) tab.close();
        m.textContent = T.er; btn.disabled = false; btn.textContent = T.b;
      });
    });
  }

  function sendSupabase(d) {
    return fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/catalogue_leads', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name: d.name, phone: d.phone, email: d.email, org: d.org, source: d.source, page: d.page, user_agent: navigator.userAgent.slice(0, 250) })
    }).then(function (r) { if (!r.ok) throw new Error('sb ' + r.status); });
  }
  function sendPhp(d) {
    var fd = new FormData();
    Object.keys(d).forEach(function (k) { if (d[k] != null) fd.append(k, d[k]); });
    return fetch(BASE + 'lead.php', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'php'); });
  }
  // Save to Supabase and, in parallel, to lead.php (which emails info@kap.energy the updated Excel list).
  // Succeeds if either one stores the lead.
  function send(d) {
    var jobs = [sendPhp(d)];
    if (SUPABASE_URL && SUPABASE_KEY) jobs.push(sendSupabase(d));
    return new Promise(function (ok, fail) {
      var left = jobs.length;
      jobs.forEach(function (j) { j.then(ok, function () { if (--left === 0) fail(); }); });
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="kap-catalogue-"][href$=".pdf"]');
    if (!a || done()) return;
    e.preventDefault();
    open(a.href);
  });
})();

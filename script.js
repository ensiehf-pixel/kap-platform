const EN = document.documentElement.lang === 'en';
/* ========================================================
   KAP ENERGY — Landing Page JavaScript
   ======================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Header Scroll Effect ---------- */
  const header = document.getElementById('header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Initial check

  /* ---------- Mobile Navigation Toggle ---------- */
  const mobileToggle = document.getElementById('mobile-toggle');
  const nav = document.getElementById('nav');

  const setMenu = (open) => {
    if (!nav || !mobileToggle) return;
    nav.classList.toggle('active', open);
    mobileToggle.setAttribute('aria-expanded', String(open));
    mobileToggle.setAttribute('aria-label', open ? (EN ? 'Close menu' : 'بستن منو') : (EN ? 'Open menu' : 'باز کردن منو'));
    const spans = mobileToggle.querySelectorAll('span');
    spans[0].style.transform = open ? 'rotate(45deg) translate(5px, 5px)' : 'none';
    spans[1].style.opacity = open ? '0' : '1';
    spans[2].style.transform = open ? 'rotate(-45deg) translate(5px, -5px)' : 'none';
  };

  if (mobileToggle && nav) {
    mobileToggle.addEventListener('click', () => setMenu(!nav.classList.contains('active')));
    nav.querySelectorAll('.nav__link:not(.nav__toggle), .nav__sublink').forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  }

  /* ---------- Infinite Marquee Duplication ---------- */
  const marqueeTrack = document.getElementById('marquee-track');

  if (marqueeTrack) {
    // Clone the content to create seamless infinite loop
    const content = marqueeTrack.innerHTML;
    marqueeTrack.innerHTML = content + content;
  }

  /* ---------- Scroll Reveal Animations ---------- */
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    }
  );

  revealElements.forEach(el => revealObserver.observe(el));

  /* ---------- Smooth Scroll for Anchor Links ---------- */
  // Only apply smooth scroll to links that do NOT open in a new tab
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      // Skip links with target="_blank" — let the browser open them in a new tab
      if (anchor.getAttribute('target') === '_blank') {
        return;
      }

      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

});

/* ---------- Form Submission Handler ----------
   No server backend: compose an email to KAP in the visitor's mail app. */
const KAP_EMAIL = 'info@kap.energy';
function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const lines = [];
  const cats = [...document.querySelectorAll('.cat-btn.active')].map(b => b.textContent.trim());
  if (cats.length) lines.push((EN ? 'Type of activity: ' : 'نوع فعالیت: ') + cats.join(EN ? ', ' : '، '));
  form.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.name && !el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') { if (!el.checked) return; }
    const v = (el.value || '').trim();
    if (!v) return;
    const lab = el.id && form.querySelector('label[for="' + el.id + '"]');
    const name = lab ? lab.textContent.replace('*', '').trim() : (el.name || el.id);
    lines.push(name + ': ' + v);
  });
  const subjectField = form.querySelector('#subject');
  const subject = (form.dataset.subject || (EN ? 'Message from the KAP website' : 'پیام از وب‌سایت کاپ')) + (subjectField && subjectField.value.trim() ? ' — ' + subjectField.value.trim() : '');
  const url = 'mailto:' + KAP_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
  window.location.href = url;
  const status = form.querySelector('.form-status') || Object.assign(document.createElement('p'), { className: 'form-status' });
  status.setAttribute('role', 'status');
  status.innerHTML = EN ? 'Your email app has opened; send the message from there. If it didn\'t open, write directly to <a href="mailto:' + KAP_EMAIL + '">' + KAP_EMAIL + '</a> or call <a href="tel:+982191093189">+98 21 9109 3189</a>.' : 'برنامهٔ ایمیل شما باز شد؛ پیام را از آنجا ارسال کنید. اگر باز نشد، مستقیم به <a href="mailto:' + KAP_EMAIL + '" dir="ltr">' + KAP_EMAIL + '</a> بنویسید یا با <a href="tel:+982191093189" dir="ltr">021-91093189</a> تماس بگیرید.';
  if (!status.parentNode) form.appendChild(status);
}


/* ---------- Wellness games submenu (added 2026-10-25) ---------- */
(function () {
  document.querySelectorAll('.nav__group').forEach(function (g) {
    var b = g.querySelector('.nav__toggle');
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !g.classList.contains('open');
      g.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open);
    });
  });
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.nav__group.open').forEach(function (g) {
      if (!g.contains(e.target)) { g.classList.remove('open'); var b = g.querySelector('.nav__toggle'); if (b) b.setAttribute('aria-expanded', 'false'); }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.nav__group.open').forEach(function (g) { g.classList.remove('open'); });
  });
})();

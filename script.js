/* ========================================================
   KAP ENERGY — Landing Page JavaScript
   ======================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Header Scroll Effect ---------- */
  const header = document.getElementById('header');

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

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      nav.classList.toggle('active');
      const spans = mobileToggle.querySelectorAll('span');
      if (nav.classList.contains('active')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      }
    });
  }

  // Close mobile nav on link click
  document.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('active');
      const spans = mobileToggle.querySelectorAll('span');
      spans[0].style.transform = 'none';
      spans[1].style.opacity = '1';
      spans[2].style.transform = 'none';
    });
  });

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

/* ---------- Form Submission Handler ---------- */
function handleSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const submitBtn = document.getElementById('submit-btn');
  const originalText = submitBtn.textContent;

  // Loading state
  submitBtn.textContent = 'در حال ارسال...';
  submitBtn.style.opacity = '0.7';
  submitBtn.style.pointerEvents = 'none';

  // Simulate form submission
  setTimeout(() => {
    submitBtn.textContent = '✓ ارسال شد!';
    submitBtn.style.opacity = '1';
    submitBtn.style.background = '#2E7D32';

    // Reset after delay
    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.style.background = '';
      submitBtn.style.pointerEvents = '';
      form.reset();
    }, 2500);
  }, 1200);
}

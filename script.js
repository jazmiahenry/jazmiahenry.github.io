/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Maison J·H — interactions
   minimal by design. masthead fade, scroll reveal, mobile menu.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── masthead: tightens after the hero ──────────────────────────────── */
  const masthead = document.querySelector('.masthead');
  const onScroll = () => {
    if (!masthead) return;
    masthead.classList.toggle('is-scrolled', window.scrollY > 80);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── scroll reveal: editorial fade-up on first sight ────────────────── */
  const revealTargets = document.querySelectorAll(
    '.section, .hero-meta, .hero-name, .hero-slash, .hero-subtitle, .hero-scroll'
  );
  revealTargets.forEach((el) => el.classList.add('reveal'));

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );
    revealTargets.forEach((el) => io.observe(el));
  }

  /* ── mobile menu: full-bleed atelier curtain ────────────────────────── */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (e) => {
      if (e.target instanceof HTMLAnchorElement) {
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── hero name: micro-tilt on cursor — couture parallax ─────────────── */
  if (!reduceMotion) {
    const name = document.querySelector('.hero-name');
    if (name) {
      const hero = name.closest('.hero');
      hero?.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        name.style.transform = `translate(${x * 8}px, ${y * 4}px)`;
      });
      hero?.addEventListener('mouseleave', () => {
        name.style.transform = '';
      });
    }
  }
})();

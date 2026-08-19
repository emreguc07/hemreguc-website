// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Active nav link on scroll + sliding indicator
const sections = document.querySelectorAll('main section[id]');
const navAnchors = document.querySelectorAll('.nav-links a');
const navIndicator = document.getElementById('navIndicator');
const navLinksList = document.getElementById('navLinks');

const moveIndicatorTo = (link) => {
  if (!link || !navIndicator || !navLinksList) return;
  const listRect = navLinksList.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  navIndicator.style.width = `${linkRect.width}px`;
  navIndicator.style.transform = `translateX(${linkRect.left - listRect.left}px)`;
  navIndicator.style.opacity = '1';
};

const setActive = (id) => {
  navAnchors.forEach((a) => {
    const isActive = a.getAttribute('href') === `#${id}`;
    a.classList.toggle('active', isActive);
    if (isActive) moveIndicatorTo(a);
  });
};

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setActive(entry.target.id);
      }
    });
  },
  { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
);

sections.forEach((section) => sectionObserver.observe(section));

// Position indicator correctly once fonts/layout settle, and on resize
window.addEventListener('load', () => {
  const activeLink = document.querySelector('.nav-links a.active');
  moveIndicatorTo(activeLink);
});
window.addEventListener('resize', () => {
  const activeLink = document.querySelector('.nav-links a.active');
  moveIndicatorTo(activeLink);
});

// Scroll reveal animations
const revealTargets = document.querySelectorAll('.reveal, .reveal-stagger');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
revealTargets.forEach((el) => revealObserver.observe(el));

// ---- Premium interaction layer ----
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Preloader: reveal hero after a brief beat. Script runs at end of body (DOM
// already parsed), so this doesn't need to wait on readyState/load — and a
// CSS animation (see .preloader) force-hides it too as a hard safety net.
const preloader = document.getElementById('preloader');
const MIN_PRELOAD_MS = prefersReducedMotion ? 0 : 500;
let revealed = false;

const revealPage = () => {
  if (revealed) return;
  revealed = true;
  if (preloader) preloader.classList.add('is-hidden');
  document.body.classList.add('ready');
};

setTimeout(revealPage, MIN_PRELOAD_MS);

// Scroll progress bar
const scrollProgress = document.getElementById('scrollProgress');
const updateScrollProgress = () => {
  if (!scrollProgress) return;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
  scrollProgress.style.transform = `scaleX(${ratio})`;
};
let progressTicking = false;
window.addEventListener('scroll', () => {
  if (!progressTicking) {
    requestAnimationFrame(() => {
      updateScrollProgress();
      progressTicking = false;
    });
    progressTicking = true;
  }
});
updateScrollProgress();

// Custom cursor (desktop with a real mouse only)
if (hasFinePointer && !prefersReducedMotion) {
  document.documentElement.classList.add('has-cursor');

  const cursorDot = document.getElementById('cursorDot');
  const cursorRing = document.getElementById('cursorRing');
  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    document.documentElement.classList.add('cursor-active');
    if (cursorDot) {
      cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    }
  });
  window.addEventListener('mouseleave', () => {
    document.documentElement.classList.remove('cursor-active');
  });

  const animateRing = () => {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    if (cursorRing) {
      cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
    }
    requestAnimationFrame(animateRing);
  };
  requestAnimationFrame(animateRing);

  const hoverables = document.querySelectorAll('a, button, .project-card, .stack-tags span');
  hoverables.forEach((el) => {
    el.addEventListener('mouseenter', () => cursorRing && cursorRing.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => cursorRing && cursorRing.classList.remove('cursor-hover'));
  });
}

// Magnetic buttons
if (hasFinePointer && !prefersReducedMotion) {
  document.querySelectorAll('.magnetic').forEach((btn) => {
    const strength = 0.35;
    const maxOffset = 12;

    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      const offsetX = Math.max(-maxOffset, Math.min(maxOffset, relX * strength));
      const offsetY = Math.max(-maxOffset, Math.min(maxOffset, relY * strength));
      btn.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
}

// Card tilt + spotlight
if (hasFinePointer && !prefersReducedMotion) {
  document.querySelectorAll('.project-card.tilt').forEach((card) => {
    const maxTilt = 6;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * maxTilt * 2;
      const rotateX = (0.5 - py) * maxTilt * 2;
      card.style.transform = `translateY(-6px) perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

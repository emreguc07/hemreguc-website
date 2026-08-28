// ---------------------------------------------------------------------------
// Scroll-linked 130-frame explode/reassemble hero (index.html only) + shared
// site chrome (nav, scroll-reveal, scroll progress — every page).
// Pure vanilla HTML5 Canvas + rAF, no dependencies.
// ---------------------------------------------------------------------------

// Every page load starts at the top instead of the browser restoring the
// scroll position from before a refresh — otherwise the hero canvas (which
// always boots showing frame 1) ends up out of sync with wherever the
// restored scroll position says it should be.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const TOTAL_FRAMES = 130;
const FRAME_PATH = (i) => `assets/hero-frame-${String(i).padStart(3, '0')}.webp`;

const canvas = document.getElementById('canvas');

if (canvas) {
  const ctx = canvas.getContext('2d');
  const scrollyContainer = document.getElementById('scrollyContainer');
  const preloader = document.getElementById('preloader');
  const preloaderCount = document.getElementById('preloaderCount');
  const preloaderFill = document.getElementById('preloaderFill');
  const textSections = Array.from(document.querySelectorAll('.scrolly-text'));

  const images = new Array(TOTAL_FRAMES);
  let loadedCount = 0;
  let currentFrame = -1;   // last (fractional) frame actually drawn
  let targetFrame = 0;     // where scroll wants us to be (fractional, unrounded)
  let displayFrame = 0;    // eased position that chases targetFrame each tick
  let ready = false;

  // How quickly the displayed frame catches up to the scroll target each
  // tick. Lower = smoother/slower trailing motion, higher = snappier.
  const EASE = 0.12;

  // ---- Preload all frames into memory, tracking real progress ----
  function preloadFrames() {
    return new Promise((resolve) => {
      for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image();
        img.onload = img.onerror = () => {
          loadedCount++;
          const pct = Math.round((loadedCount / TOTAL_FRAMES) * 100);
          if (preloaderCount) preloaderCount.textContent = `${pct}%`;
          if (preloaderFill) preloaderFill.style.width = `${pct}%`;
          if (loadedCount === TOTAL_FRAMES) resolve();
        };
        img.src = FRAME_PATH(i);
        images[i - 1] = img;
      }
    });
  }

  // Offscreen layer the sharp frame is drawn onto before its left/right
  // edges get feathered (see featherSharpLayer) — kept sized to match the
  // main canvas so the two composite pixel-for-pixel.
  const sharpLayer = document.createElement('canvas');
  const sharpLayerCtx = sharpLayer.getContext('2d');

  // ---- Retina-aware canvas sizing ----
  // dpr is capped at 2: the hero footage is a 16:9 source drawn "fit-height"
  // (see drawImageCoverTo), so on a tall portrait phone at dpr 3 the canvas
  // height alone (e.g. ~2500px) would force the 1080px-tall source frames to
  // stretch ~2.3x — visibly blurry regardless of source resolution. Capping
  // at 2 keeps that upscale factor much smaller (and still reads as sharp;
  // photographic/video content doesn't benefit from dpr 3 the way text does).
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    sharpLayer.width = canvas.width;
    sharpLayer.height = canvas.height;
    if (ready) drawFrame(displayFrame, true);
  }

  // ---- Fit-height draw of a single image onto the given context: the
  //      full frame is always shown, top to bottom, at whatever width
  //      that implies. On a window wider than the footage's 16:9, this
  //      leaves a gap at the sides instead of cropping the phone or its
  //      reflection — but that gap shows the ambient backdrop underneath
  //      (see drawAmbientBackdrop) with the sharp frame's own edges
  //      feathered into it (see featherSharpLayer), rather than a hard-
  //      edged cut. Returns the drawn image's horizontal bounds so the
  //      caller can feather relative to them.
  //      (The fixed nav bar floating above this is handled in CSS — see
  //      .site-header--transparent — rather than by skewing this crop,
  //      since on wide viewports clearing it that way needed an amount of
  //      zoom that badly cropped the sides instead.) ----
  function drawImageCoverTo(targetCtx, img) {
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = ch / ih;
    const dw = iw * scale;
    const dh = ch;
    const dx = (cw - dw) / 2;
    targetCtx.drawImage(img, dx, 0, dw, dh);
    return { dx, dw };
  }

  // ---- Feathers the sharp layer's left/right edges to transparent over
  //      FEATHER_PX, so where a gap exists (dx > 0) the crisp frame melts
  //      into the blurred backdrop instead of stopping at a hard line. No-
  //      op when the frame already spans the full canvas width. ----
  const FEATHER_PX = 140;
  function featherSharpLayer(dx, dw) {
    if (dx < 1) return;
    const w = sharpLayer.width;
    const h = sharpLayer.height;
    const feather = Math.min(FEATHER_PX, dw / 2);
    sharpLayerCtx.save();
    sharpLayerCtx.globalCompositeOperation = 'destination-in';
    const grad = sharpLayerCtx.createLinearGradient(dx, 0, dx + dw, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(feather / dw, 'rgba(0,0,0,1)');
    grad.addColorStop(1 - feather / dw, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sharpLayerCtx.fillStyle = grad;
    sharpLayerCtx.fillRect(0, 0, w, h);
    sharpLayerCtx.restore();
  }

  // ---- Ambient backdrop: a downscaled, blurred copy of the same frame
  //      stretched to fill the whole canvas, so the side gaps left by the
  //      sharp fit-height frame above pick up a soft glow from the footage
  //      instead of sitting flat and empty. The side gaps are typically
  //      only 100-150px wide, so the sample needs enough real resolution
  //      across that span to read as a gradient rather than flat bands —
  //      too coarse a downscale (a handful of px) looked like solid
  //      horizontal stripes once stretched. The blur itself is applied at
  //      this small size, where it's cheap, rather than at full canvas
  //      size every frame. ----
  const bgSample = document.createElement('canvas');
  const bgSampleCtx = bgSample.getContext('2d');
  const BG_SAMPLE_W = 200;
  const BG_SAMPLE_H = 113;
  bgSample.width = BG_SAMPLE_W;
  bgSample.height = BG_SAMPLE_H;

  function drawAmbientBackdrop(img) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const sScale = Math.max(BG_SAMPLE_W / iw, BG_SAMPLE_H / ih);
    const sw = iw * sScale;
    const sh = ih * sScale;
    bgSampleCtx.clearRect(0, 0, BG_SAMPLE_W, BG_SAMPLE_H);
    bgSampleCtx.filter = 'blur(6px)';
    bgSampleCtx.drawImage(img, (BG_SAMPLE_W - sw) / 2, (BG_SAMPLE_H - sh) / 2, sw, sh);
    bgSampleCtx.filter = 'none';

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(bgSample, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // ---- Fractional-frame draw: crossfades between the two nearest loaded
  //      frames so eased motion looks like smooth video instead of the
  //      sequence snapping between whole frames. ----
  function drawFrame(frameFloat, force) {
    if (!force && Math.abs(frameFloat - currentFrame) < 0.001) return;

    const clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, frameFloat));
    const lowIdx = Math.floor(clamped);
    const highIdx = Math.min(TOTAL_FRAMES - 1, Math.ceil(clamped));
    const t = clamped - lowIdx;

    const lowImg = images[lowIdx];
    if (!lowImg || !lowImg.complete || lowImg.naturalWidth === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    drawAmbientBackdrop(lowImg);

    sharpLayerCtx.clearRect(0, 0, sharpLayer.width, sharpLayer.height);
    sharpLayerCtx.globalAlpha = 1;
    const { dx, dw } = drawImageCoverTo(sharpLayerCtx, lowImg);

    const highImg = images[highIdx];
    if (highIdx !== lowIdx && t > 0.001 && highImg && highImg.complete && highImg.naturalWidth !== 0) {
      sharpLayerCtx.globalAlpha = t;
      drawImageCoverTo(sharpLayerCtx, highImg);
      sharpLayerCtx.globalAlpha = 1;
    }

    featherSharpLayer(dx, dw);
    ctx.drawImage(sharpLayer, 0, 0);

    currentFrame = clamped;
  }

  // ---- Scroll → progress (0..1) → frame index + text overlay visibility ----
  function getScrollProgress() {
    const rect = scrollyContainer.getBoundingClientRect();
    const total = scrollyContainer.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const scrolled = -rect.top;
    return Math.min(1, Math.max(0, scrolled / total));
  }

  function updateTextSections(progress) {
    textSections.forEach((el) => {
      const [start, end] = el.dataset.range.split(',').map(Number);
      const visible = progress >= start && progress <= end;
      el.classList.toggle('is-visible', visible);
    });
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const progress = getScrollProgress();
      targetFrame = progress * (TOTAL_FRAMES - 1); // fractional — no rounding
      updateTextSections(progress);
      ticking = false;
    });
  }

  // ---- Render loop: eases displayFrame toward targetFrame every tick
  //      (instead of snapping straight to it), so fast scrolls glide through
  //      the sequence instead of jumping between frames. Settles to an exact
  //      stop once close enough, so idle scroll still costs nothing. ----
  function renderLoop() {
    const diff = targetFrame - displayFrame;
    if (Math.abs(diff) > 0.01) {
      displayFrame += diff * EASE;
      drawFrame(displayFrame);
    } else if (displayFrame !== targetFrame) {
      displayFrame = targetFrame;
      drawFrame(displayFrame, true);
    }
    requestAnimationFrame(renderLoop);
  }

  // ---- Boot ----
  (async function initScrolly() {
    document.body.classList.add('is-loading');
    resizeCanvas();

    await preloadFrames();
    ready = true;

    drawFrame(0, true);
    updateTextSections(0);

    document.body.classList.remove('is-loading');
    if (preloader) preloader.classList.add('is-hidden');

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(renderLoop);
  })();
}

// ---------------------------------------------------------------------------
// Site chrome — nav, scroll-reveal, scroll progress. Runs on every page.
// ---------------------------------------------------------------------------

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinksEl = document.getElementById('navLinks');
if (navToggle && navLinksEl) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinksEl.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navLinksEl.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinksEl.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Sliding nav indicator — sits under whichever link already carries
// class="active" in this page's own HTML (multi-page site now, so the
// active link is fixed per page, not scroll-driven).
const navIndicator = document.getElementById('navIndicator');
const moveIndicatorTo = (link) => {
  if (!link || !navIndicator || !navLinksEl) return;
  const listRect = navLinksEl.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  navIndicator.style.width = `${linkRect.width}px`;
  navIndicator.style.transform = `translateX(${linkRect.left - listRect.left}px)`;
  navIndicator.style.opacity = '1';
};
const positionIndicator = () => {
  moveIndicatorTo(document.querySelector('.nav-links a.active'));
};
positionIndicator();
window.addEventListener('resize', positionIndicator);
window.addEventListener('load', positionIndicator);

// Scroll reveal for content sections
const revealTargets = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealTargets.forEach((el) => revealObserver.observe(el));

// Whole-page scroll progress bar
const scrollProgressEl = document.getElementById('scrollProgress');
const updatePageScrollProgress = () => {
  if (!scrollProgressEl) return;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
  scrollProgressEl.style.transform = `scaleX(${ratio})`;
};
let progressTicking = false;
window.addEventListener('scroll', () => {
  if (!progressTicking) {
    requestAnimationFrame(() => {
      updatePageScrollProgress();
      progressTicking = false;
    });
    progressTicking = true;
  }
}, { passive: true });
updatePageScrollProgress();

// ---------------------------------------------------------------------------
// Yakorra ekran görüntüsü galerisi (projeler.html) — telefon çerçeveli modal,
// oklar/noktalar/klavye/kaydırma ile gezinilebiliyor. Elemanlar bu sayfada
// yoksa (diğer sayfalarda) sorunsuzca hiçbir şey yapmaz.
// ---------------------------------------------------------------------------
const YAKORRA_SCREENS = [
  { src: 'assets/screenshots/yakorra-01-splash.webp', caption: 'Düşler kapısı açılıyor' },
  { src: 'assets/screenshots/yakorra-02-anlat.webp', caption: 'Rüyanı anlat' },
  { src: 'assets/screenshots/yakorra-03-gunlugum.webp', caption: 'Rüya günlüğün' },
  { src: 'assets/screenshots/yakorra-04-dus-kuresi.webp', caption: 'Düş Küresi' },
  { src: 'assets/screenshots/yakorra-05-uyku-sesler.webp', caption: 'Uyku & sesler' },
];

const ssModal = document.getElementById('ssModal');
const ssScreen = document.getElementById('ssScreen');
const ssImage = document.getElementById('ssImage');
const ssCaption = document.getElementById('ssCaption');
const ssDots = document.getElementById('ssDots');
const ssPhone = document.getElementById('ssPhone');
let ssIndex = 0;
let ssSwitchTimer = null;

function ssBuildDots() {
  if (!ssDots) return;
  ssDots.innerHTML = '';
  YAKORRA_SCREENS.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'ss-modal__dot';
    dot.setAttribute('aria-label', `${i + 1}. ekran`);
    dot.addEventListener('click', () => ssShow(i));
    ssDots.appendChild(dot);
  });
}

function ssShow(index) {
  ssIndex = (index + YAKORRA_SCREENS.length) % YAKORRA_SCREENS.length;
  const screen = YAKORRA_SCREENS[ssIndex];

  clearTimeout(ssSwitchTimer);
  ssScreen?.classList.add('is-switching');
  ssSwitchTimer = setTimeout(() => {
    if (ssImage) {
      ssImage.src = screen.src;
      ssImage.alt = screen.caption;
    }
    if (ssCaption) ssCaption.textContent = screen.caption;
    ssScreen?.classList.remove('is-switching');
  }, 180);

  Array.from(ssDots?.children || []).forEach((dot, i) => {
    dot.classList.toggle('is-active', i === ssIndex);
  });
}

function ssOpen(startIndex) {
  if (!ssModal) return;
  ssBuildDots();
  ssShow(startIndex || 0);
  ssModal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function ssClose() {
  if (!ssModal) return;
  ssModal.classList.remove('is-open');
  document.body.style.overflow = '';
}

const ssTrigger = document.getElementById('ssTrigger');
ssTrigger?.addEventListener('click', () => ssOpen(0));
ssTrigger?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    ssOpen(0);
  }
});

document.getElementById('ssModalClose')?.addEventListener('click', ssClose);
document.getElementById('ssPrev')?.addEventListener('click', () => ssShow(ssIndex - 1));
document.getElementById('ssNext')?.addEventListener('click', () => ssShow(ssIndex + 1));
ssModal?.addEventListener('click', (e) => {
  if (e.target === ssModal) ssClose();
});
document.addEventListener('keydown', (e) => {
  if (!ssModal?.classList.contains('is-open')) return;
  if (e.key === 'Escape') ssClose();
  if (e.key === 'ArrowLeft') ssShow(ssIndex - 1);
  if (e.key === 'ArrowRight') ssShow(ssIndex + 1);
});

// Dokunmatik kaydırma (swipe) desteği
let ssTouchStartX = null;
ssPhone?.addEventListener('touchstart', (e) => {
  ssTouchStartX = e.touches[0].clientX;
}, { passive: true });
ssPhone?.addEventListener('touchend', (e) => {
  if (ssTouchStartX === null) return;
  const dx = e.changedTouches[0].clientX - ssTouchStartX;
  if (Math.abs(dx) > 40) {
    ssShow(dx > 0 ? ssIndex - 1 : ssIndex + 1);
  }
  ssTouchStartX = null;
});

// ---------------------------------------------------------------------------
// HEG Apps — scroll-linked 36-frame explode/reassemble sequence.
// Pure vanilla HTML5 Canvas + rAF, no dependencies.
// ---------------------------------------------------------------------------

const TOTAL_FRAMES = 36;
const FRAME_PATH = (i) => `assets/ezgif-frame-${String(i).padStart(3, '0')}.jpg`;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scrollyContainer = document.getElementById('scrollyContainer');
const preloader = document.getElementById('preloader');
const preloaderCount = document.getElementById('preloaderCount');
const preloaderFill = document.getElementById('preloaderFill');
const textSections = Array.from(document.querySelectorAll('.scrolly-text'));

const images = new Array(TOTAL_FRAMES);
let loadedCount = 0;
let currentFrame = -1; // last frame actually drawn
let targetFrame = 0;
let ready = false;

// ---- Preload all 36 frames into memory, tracking real progress ----
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

// ---- Retina-aware canvas sizing ----
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  if (ready) drawFrame(currentFrame === -1 ? 0 : currentFrame, true);
}

// ---- Cover-fit draw: fills the canvas edge-to-edge, cropping overflow,
//      so there is never a background seam to hide (see css note on why
//      this replaces the originally-briefed contain-fit + flat-bg match). ----
function drawFrame(index, force) {
  if (!force && index === currentFrame) return;
  const img = images[index];
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
  currentFrame = index;
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
    targetFrame = Math.round(progress * (TOTAL_FRAMES - 1));
    updateTextSections(progress);
    ticking = false;
  });
}

// ---- Render loop: only redraws when the target frame actually changes,
//      so idle scroll costs nothing while active scroll stays buttery. ----
function renderLoop() {
  if (targetFrame !== currentFrame) drawFrame(targetFrame);
  requestAnimationFrame(renderLoop);
}

// ---- Boot ----
async function init() {
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
}

init();

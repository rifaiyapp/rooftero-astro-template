const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');

let currentY = window.scrollY;
let targetY = currentY;
let frame = 0;

const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function stopAnimation() {
  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
  currentY = window.scrollY;
  targetY = currentY;
}

function hasScrollableAncestor(target: EventTarget | null, deltaY: number) {
  let element = target instanceof HTMLElement ? target : null;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const scrollable = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;

    if (scrollable) {
      const atTop = element.scrollTop <= 0;
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
      if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
    }

    element = element.parentElement;
  }

  return false;
}

function animateScroll() {
  const distance = targetY - currentY;
  currentY += distance * 0.16;

  if (Math.abs(distance) < 0.5) {
    currentY = targetY;
    window.scrollTo(0, targetY);
    frame = 0;
    return;
  }

  window.scrollTo(0, currentY);
  frame = window.requestAnimationFrame(animateScroll);
}

window.addEventListener('wheel', (event) => {
  if (reducedMotion.matches || !finePointer.matches || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

  if (hasScrollableAncestor(event.target, event.deltaY)) {
    stopAnimation();
    return;
  }

  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? window.innerHeight
      : 1;
  const delta = event.deltaY * unit;
  if (Math.abs(delta) < 0.5) return;

  event.preventDefault();

  if (!frame) {
    currentY = window.scrollY;
    targetY = currentY;
  }

  targetY = clamp(targetY + delta, 0, maxScrollY());
  if (!frame) frame = window.requestAnimationFrame(animateScroll);
}, { passive: false });

window.addEventListener('scroll', () => {
  if (!frame) {
    currentY = window.scrollY;
    targetY = currentY;
  }
}, { passive: true });

window.addEventListener('resize', () => {
  targetY = clamp(targetY, 0, maxScrollY());
}, { passive: true });

document.addEventListener('click', (event) => {
  if (!(event instanceof MouseEvent) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link || link.target || link.hasAttribute('download')) return;

  const hash = link.hash;
  if (!hash || hash === '#') return;

  const id = decodeURIComponent(hash.slice(1));
  const target = id === 'top' ? document.getElementById('top') ?? document.documentElement : document.getElementById(id);
  if (!target) return;

  event.preventDefault();
  stopAnimation();
  target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  window.history.pushState(null, '', hash);
});

for (const eventName of ['pointerdown', 'touchstart', 'keydown'] as const) {
  window.addEventListener(eventName, stopAnimation, { passive: true });
}

reducedMotion.addEventListener('change', stopAnimation);
finePointer.addEventListener('change', stopAnimation);

import Lenis from "lenis";
import "lenis/dist/lenis.css";

/*
 * Smooth (eased) mouse-wheel scrolling for the page, using Lenis.
 * - Only runs while a scroll is actually moving (no loop ticking on every frame when idle).
 * - Scroll areas inside the page (lists, popups, the dialog contents) keep scrolling on their own.
 * - Elements marked data-lenis-prevent (the sidebar) are left alone.
 * - Pauses while a dialog is open (they lock the page with overflow: hidden on <body>).
 * - Off for anyone who asked their system for reduced motion, and on touch screens (native is better there).
 */
export function startSmoothScroll() {
  if (typeof window === "undefined") return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;

  const lenis = new Lenis({
    autoRaf: false, // we drive it ourselves, only while scrolling
    lerp: 0.12, // how quickly it catches up with the wheel: lower = smoother, floatier
    smoothWheel: true,
    syncTouch: false,
    allowNestedScroll: true,
    anchors: true, // links to #ids on the page glide too
  });

  // Run frames only while Lenis is moving the page.
  let frame = 0;
  const tick = (t) => {
    lenis.raf(t);
    frame = lenis.isScrolling ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  window.addEventListener("wheel", kick, { passive: true });
  lenis.on("scroll", kick);

  // Dialogs lock the page; stop smooth scrolling while they're open.
  const syncLock = () => (document.body.style.overflow === "hidden" ? lenis.stop() : lenis.start());
  new MutationObserver(syncLock).observe(document.body, { attributes: true, attributeFilter: ["style"] });

  window.__lenis = lenis; // handy for debugging
  return lenis;
}

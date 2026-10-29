import { useEffect, useRef, useState } from "react";
import { cx, useInViewOnce } from "./ui";

/*
 * Small animation helpers. Everything runs once (nothing loops), and people who've asked their
 * system for reduced motion get the end state straight away.
 */

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** False on the first render, true right after: lets CSS transitions run from an "empty" start. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

const ease = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Text whose numbers count up from 0 the first time it's shown, e.g. "8h 30m", "62%", "3 / 5".
 * Later changes show straight away (no re-animating while numbers tick).
 */
export function CountUp({ text, duration = 700 }) {
  const value = String(text ?? "");
  const ref = useRef(null);
  const inView = useInViewOnce(ref); // counts up when you scroll to it, not before
  const [shown, setShown] = useState(() => (reducedMotion() ? value : value.replace(/\d+(\.\d+)?/g, "0")));
  const done = useRef(reducedMotion());

  useEffect(() => {
    if (done.current) return setShown(value);
    if (!inView) return setShown(value.replace(/\d+(\.\d+)?/g, "0"));
    const parts = value.split(/(\d+(?:\.\d+)?)/);
    const start = Date.now();
    // A plain timer (not animation frames), so it always finishes even if the tab isn't drawing.
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setShown(
        parts
          .map((s, i) => {
            if (i % 2 === 0) return s; // text between numbers
            const decimals = s.includes(".") ? s.split(".")[1].length : 0;
            return (Number(s) * ease(p)).toFixed(decimals);
          })
          .join(""),
      );
      if (p >= 1) {
        done.current = true;
        clearInterval(timer);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [value, duration, inView]);

  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}

/**
 * Cards that appear as you scroll: each direct child of the element `ref` is attached to stays hidden
 * (and its bar animations wait) until it scrolls into view, then fades up. Children that come into
 * view together appear one after another. Pair with the `reveal` class (index.css).
 */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const showAll = () => [...root.children].forEach((c) => (c.dataset.shown = ""));
    if (reducedMotion() || typeof IntersectionObserver === "undefined") return showAll();
    const io = new IntersectionObserver(
      (entries) => {
        let n = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.style.transitionDelay = `${n++ * 90}ms`;
          e.target.dataset.shown = "";
          io.unobserve(e.target);
        }
      },
      // Huge top margin: cards already scrolled past (above the screen) count as seen too.
      { threshold: 0.12, rootMargin: "100000px 0px -40px 0px" },
    );
    // Watch every card, including ones added later (e.g. after data loads).
    const watch = () => [...root.children].forEach((c) => !("shown" in c.dataset) && io.observe(c));
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return ref;
}

/** Opens and closes its content smoothly (height and fade). Content is only rendered while open or closing. */
export function Collapse({ open, children, className }) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(open); // fully open: stop clipping (shadows, focus rings)

  useEffect(() => {
    if (open) {
      setRender(true);
      const show = setTimeout(() => setShown(true), 20); // after the closed state has been drawn
      const t = setTimeout(() => setSettled(true), 340);
      return () => {
        clearTimeout(show);
        clearTimeout(t);
      };
    }
    setSettled(false);
    setShown(false);
    const t = setTimeout(() => setRender(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  if (!render) return null;
  return (
    <div
      className={cx(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-smooth",
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className={cx("min-h-0", !settled && "overflow-hidden")}>{children}</div>
    </div>
  );
}

/** True for a moment right after `item` changes to Completed (not when it's already completed on load). */
export function useJustCompleted(item) {
  const done = item?.status === "Completed";
  const was = useRef(done);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (done && !was.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      was.current = done;
      return () => clearTimeout(t);
    }
    was.current = done;
  }, [done]);
  return flash;
}

/**
 * A work item's name: crossed out when completed. At the moment it's marked Completed, the line is
 * drawn across instead of just appearing.
 */
export function DoneName({ item, children }) {
  const flash = useJustCompleted(item);
  const done = item?.status === "Completed";
  return <span className={cx(done && (flash ? "strike-draw animate-strike" : "line-through"))}>{children}</span>;
}

/** Wraps a status pill: it pops and flashes green at the moment the item is marked Completed. */
export function DonePop({ item, children }) {
  const flash = useJustCompleted(item);
  return <span className={cx("inline-flex rounded-full", flash && "animate-done-pop")}>{children}</span>;
}

/**
 * Folds a list row away (fade + collapse) before it's removed. Resolves straight away if it isn't on screen.
 * If the row is still there a moment later (the delete was refused), it unfolds again.
 */
export async function foldAway(itemId) {
  const el = document.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
  if (!el || reducedMotion()) return;
  const h = el.getBoundingClientRect().height;
  const overflow = el.style.overflow;
  el.style.overflow = "hidden";
  const anim = el.animate(
      [
        { opacity: 1, height: `${h}px`, transform: "none" },
        { opacity: 0, height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", transform: "translateX(-12px)" },
      ],
    { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
  );
  await anim.finished.catch(() => {});
  setTimeout(() => {
    if (!el.isConnected) return;
    anim.cancel();
    el.style.overflow = overflow;
  }, 2000);
}

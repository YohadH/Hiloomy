"use client";

import { useCallback, useEffect, useRef } from "react";

// A dependency-free spring + gesture engine for the /welcome "three layers"
// panel, implementing the physics from the apple-design skill: a single
// continuous position `pos` (which layer we're on, as a float) is driven by
// ONE interruptible, velocity-aware spring. Scroll, click and drag all move
// the same value, so every input can be grabbed and reversed mid-flight.
//
// Why the panels are written imperatively (element transforms set per RAF
// frame) rather than through React state: a 60fps re-render on every frame
// would be the exact jank the skill warns against. React state is touched
// only when the *integer* layer changes, to sync the index list + scroll.
//
//   §2  direct manipulation — 1:1 finger tracking, grab offset respected
//   §3  interruptibility    — pointerdown reads the live animated value
//   §4  behavior over anim  — spring, not a fixed-duration transition
//   §5  velocity handoff    — release velocity becomes the spring's velocity
//   §6  momentum projection — throw lands where the flick is going
//   §9  rubber-banding      — soft resistance past the first/last layer
//  §10  gesture design      — 10px directional threshold; vertical scroll wins

/** Apple's momentum projection (Designing Fluid Interfaces sample code).
 *  Exponential decay, NOT the v²/2a textbook form. px in, px out. */
function project(initialVelocity: number, decelerationRate = 0.998): number {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary — real things slow before they stop. */
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Critically-damped-ish spring params from the skill's two designer knobs.
 *  response = seconds to reach target; damping (ζ) = overshoot (1 = none). */
function springConstants(response: number, damping: number) {
  const k = (2 * Math.PI / response) ** 2; // stiffness, unit mass
  const c = 2 * damping * Math.sqrt(k); // damping coefficient
  return { k, c };
}

const COMMIT_THRESHOLD = 10; // px of horizontal travel before we own the gesture (§10)

export interface LayerSwipe {
  /** Ref for the clipping viewport — also used to measure step width + dir. */
  viewportRef: (el: HTMLDivElement | null) => void;
  /** Ref factory for each absolutely-positioned panel. */
  registerPanel: (i: number) => (el: HTMLDivElement | null) => void;
  /** Spread onto the drag surface. */
  surface: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

export function useLayerSwipe(
  count: number,
  active: number,
  setActive: (i: number) => void
): LayerSwipe {
  const viewport = useRef<HTMLDivElement | null>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);

  // Continuous layer position and its velocity (layers/second).
  const pos = useRef(active);
  const vel = useRef(0);
  const target = useRef(active);
  const raf = useRef<number | null>(null);
  const reduced = useRef(false);

  // Gesture bookkeeping.
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    posAtGrab: number;
    committed: boolean;
    step: number;
    dirSign: number;
    history: Array<{ x: number; t: number }>;
  } | null>(null);

  const lastActive = useRef(active);
  // Set right before the hook itself calls setActive (during a throw or as the
  // spring crosses an integer) so the position effect below doesn't mistake
  // our own update for an external one and re-animate over the live spring.
  const ignoreNext = useRef(false);

  /** Paint every panel for the current `pos`. Neighbours sit one step to the
   *  side (reading-forward direction), scaled + faded back so the focused
   *  layer reads forward (§8 hint toward outcome, §12 depth). */
  const paint = useCallback(() => {
    const vp = viewport.current;
    if (!vp) return;
    const step = vp.clientWidth;
    const dirSign = getComputedStyle(vp).direction === "rtl" ? -1 : 1;
    const p = pos.current;
    for (let i = 0; i < panels.current.length; i++) {
      const el = panels.current[i];
      if (!el) continue;
      const dist = i - p;
      const x = dist * step * dirSign;
      const ad = Math.min(Math.abs(dist), 1);
      const scale = 1 - ad * 0.04;
      const opacity = Math.max(0, 1 - Math.abs(dist) * 0.7);
      el.style.transform = `translate3d(${x}px,0,0) scale(${scale})`;
      el.style.opacity = String(opacity);
      el.style.pointerEvents = Math.round(p) === i ? "auto" : "none";
      el.style.zIndex = String(100 - Math.round(Math.abs(dist) * 10));
    }
  }, []);

  const stop = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  /** Integrate the spring toward target.current, carrying vel.current.
   *  damping 1.0 = graceful settle for scroll/click; ~0.82 = a hair of
   *  bounce, used only when a throw carried real momentum (§4). */
  const run = useCallback((damping: number) => {
    const { k, c } = springConstants(0.42, damping);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); // clamp so a stalled tab can't explode
      last = now;
      const x = pos.current;
      const a = -k * (x - target.current) - c * vel.current;
      vel.current += a * dt;
      pos.current += vel.current * dt;

      const settled = Math.abs(pos.current - target.current) < 0.001 && Math.abs(vel.current) < 0.02;
      if (settled) {
        pos.current = target.current;
        vel.current = 0;
        paint();
        raf.current = null;
        return;
      }
      // Sync the integer layer (index list highlight + scroll lock) as we cross.
      const rounded = Math.round(pos.current);
      if (rounded !== lastActive.current && rounded >= 0 && rounded < count) {
        lastActive.current = rounded;
        ignoreNext.current = true;
        setActive(rounded);
      }
      paint();
      raf.current = requestAnimationFrame(tick);
    };
    stop();
    raf.current = requestAnimationFrame(tick);
  }, [count, paint, setActive, stop]);

  const animateTo = useCallback(
    (idx: number, velocity = 0, damping = 1) => {
      target.current = Math.max(0, Math.min(count - 1, idx));
      vel.current = velocity;
      if (reduced.current) {
        pos.current = target.current;
        vel.current = 0;
        lastActive.current = target.current;
        paint();
        return;
      }
      run(damping);
    },
    [count, paint, run]
  );

  // React to `active` changes that come from OUTSIDE a drag (scroll, click,
  // pager dots): glide there. During a committed drag we own `pos`, so ignore.
  useEffect(() => {
    if (ignoreNext.current) {
      ignoreNext.current = false;
      lastActive.current = active;
      return;
    }
    if (drag.current?.committed) return;
    if (Math.round(pos.current) === active) {
      lastActive.current = active;
      return;
    }
    animateTo(active); // external change (scroll / click / pager): glide there, no bounce
  }, [active, animateTo]);

  // Initial paint + reduced-motion probe + reflow on resize.
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paint();
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      stop();
    };
  }, [paint, stop]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      // Directional disambiguation: let the browser scroll vertically until a
      // clearly-horizontal intent crosses the threshold, then we own it. (§10)
      if (!d.committed) {
        if (Math.abs(dx) < COMMIT_THRESHOLD && Math.abs(dy) < COMMIT_THRESHOLD) return;
        if (Math.abs(dx) <= Math.abs(dy)) {
          drag.current = null; // vertical — hand it back to the page scroll
          return;
        }
        d.committed = true;
        (e.target as Element).setPointerCapture?.(d.id);
      }
      e.preventDefault();

      d.history.push({ x: e.clientX, t: e.timeStamp });
      if (d.history.length > 6) d.history.shift();

      // 1:1 — finger moves `step` px ⇒ pos moves one layer. Grab offset kept
      // because we anchor to posAtGrab, not to a snapped index. (§2)
      let next = d.posAtGrab - dx / (d.step * d.dirSign);
      // Rubber-band beyond the ends (§9).
      const max = count - 1;
      if (next < 0) next = rubberband(next, 1);
      else if (next > max) next = max + rubberband(next - max, 1);
      pos.current = next;
      vel.current = 0;
      if (raf.current != null) stop();
      paint();
    },
    [count, paint, stop]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      drag.current = null;
      if (!d.committed) return;

      // Release velocity in px/s from the recent history (§5).
      const h = d.history;
      let vpx = 0;
      if (h.length >= 2) {
        const a = h[0];
        const b = h[h.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0) vpx = (b.x - a.x) / dt;
      }
      // Project the throw, convert px → layer units, snap to nearest. (§6)
      const projectedX = (e.clientX - d.startX) + project(vpx);
      const projectedPos = d.posAtGrab - projectedX / (d.step * d.dirSign);
      const targetIdx = Math.max(0, Math.min(count - 1, Math.round(projectedPos)));
      const velLayers = -vpx / (d.step * d.dirSign); // hand off velocity in layer units (§5)
      lastActive.current = targetIdx;
      ignoreNext.current = true;
      setActive(targetIdx);
      animateTo(targetIdx, velLayers, 0.82); // a thrown card earns a little bounce (§4)
    },
    [animateTo, count, onPointerMove, setActive]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (reduced.current) return; // reduced motion: taps/clicks only, no throw
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const vp = viewport.current;
      if (!vp) return;
      stop(); // grab the value mid-flight — this is what makes it interruptible (§3)
      const step = vp.clientWidth || 1;
      const dirSign = getComputedStyle(vp).direction === "rtl" ? -1 : 1;
      drag.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        posAtGrab: pos.current,
        committed: false,
        step,
        dirSign,
        history: [{ x: e.clientX, t: e.timeStamp }]
      };
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [onPointerMove, onPointerUp, stop]
  );

  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    viewport.current = el;
  }, []);

  const registerPanel = useCallback(
    (i: number) => (el: HTMLDivElement | null) => {
      panels.current[i] = el;
    },
    []
  );

  return {
    viewportRef,
    registerPanel,
    surface: {
      onPointerDown,
      style: { touchAction: "pan-y", cursor: "grab" }
    }
  };
}

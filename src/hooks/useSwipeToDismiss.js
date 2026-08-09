import { useEffect, useRef, useState } from 'react';

// Snap points as a fraction of viewport height -- "peek" (just the header/
// summary), "half", and "full" (nearly the whole screen). Matches the real
// Google Maps bottom-sheet behavior the user asked for: drag up to expand,
// drag down to shrink or dismiss, rather than a fixed-height card.
const SNAP_POINTS = { peek: 0.34, half: 0.62, full: 0.9 };
const MIN_HEIGHT_VH = 0.14;
const DISMISS_VH = 0.2;
const DESKTOP_BREAKPOINT = 720;

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT;
}

// Drag-to-resize (and drag-down-past-threshold-to-close) for a bottom
// sheet, via its drag handle. Returns { sheetRef, handleProps, snap } —
// spread handleProps onto the handle element. A no-op on desktop, where
// these sheets become a fixed-height side panel instead (see the
// `min-width: 720px` rules in index.css) and dragging wouldn't make sense.
export function useSwipeToDismiss(onClose, initialSnap = 'peek') {
  const sheetRef = useRef(null);
  const startY = useRef(null);
  const startHeight = useRef(null);
  const dragging = useRef(false);
  const [snap, setSnap] = useState(initialSnap);

  // Land at the initial snap height once mounted, rather than whatever
  // height the content happens to render at.
  useEffect(() => {
    if (isDesktopViewport() || !sheetRef.current) return;
    sheetRef.current.style.height = `${Math.round(window.innerHeight * SNAP_POINTS[initialSnap])}px`;
    // Only on mount -- subsequent snap changes are driven by drag/setSnap below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyHeight(px) {
    if (sheetRef.current) sheetRef.current.style.height = `${px}px`;
  }

  function heightFor(fraction) {
    return Math.round(window.innerHeight * fraction);
  }

  function beginDrag(clientY) {
    if (isDesktopViewport()) return;
    dragging.current = true;
    startY.current = clientY;
    startHeight.current = sheetRef.current?.getBoundingClientRect().height ?? heightFor(SNAP_POINTS[snap]);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }

  function moveDrag(clientY) {
    if (!dragging.current || startY.current == null) return;
    const delta = clientY - startY.current; // positive = finger moved down
    const next = Math.min(heightFor(SNAP_POINTS.full), Math.max(heightFor(MIN_HEIGHT_VH), startHeight.current - delta));
    applyHeight(next);
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    const currentPx = sheetRef.current?.getBoundingClientRect().height ?? 0;
    startY.current = null;
    if (sheetRef.current) sheetRef.current.style.transition = 'height 0.2s ease';

    if (currentPx < heightFor(DISMISS_VH)) {
      onClose?.();
      return;
    }

    const [nearestSnap] = Object.entries(SNAP_POINTS).sort(
      (a, b) => Math.abs(currentPx - heightFor(a[1])) - Math.abs(currentPx - heightFor(b[1])),
    )[0];
    setSnap(nearestSnap);
    applyHeight(heightFor(SNAP_POINTS[nearestSnap]));
  }

  function onTouchStart(e) {
    beginDrag(e.touches[0].clientY);
  }
  function onTouchMove(e) {
    moveDrag(e.touches[0].clientY);
  }
  function onTouchEnd(e) {
    moveDrag(e.changedTouches[0].clientY);
    endDrag();
  }

  function onMouseDown(e) {
    beginDrag(e.clientY);
    function onMove(ev) {
      moveDrag(ev.clientY);
    }
    function onUp() {
      endDrag();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { sheetRef, handleProps: { onTouchStart, onTouchMove, onTouchEnd, onMouseDown }, snap };
}

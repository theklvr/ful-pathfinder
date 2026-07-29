import { useRef } from 'react';

const DISMISS_THRESHOLD_PX = 80;

// Drag-down-to-close for a bottom sheet, via its drag handle. Returns
// { sheetRef, handleProps } — spread handleProps onto the handle element.
export function useSwipeToDismiss(onClose) {
  const sheetRef = useRef(null);
  const startY = useRef(null);

  function onTouchStart(e) {
    startY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (startY.current == null) return;
    const delta = Math.max(0, e.touches[0].clientY - startY.current);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`;
  }

  function onTouchEnd(e) {
    if (startY.current == null) return;
    const delta = Math.max(0, e.changedTouches[0].clientY - startY.current);
    startY.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.2s ease';
      sheetRef.current.style.transform = '';
    }
    if (delta > DISMISS_THRESHOLD_PX) onClose();
  }

  return { sheetRef, handleProps: { onTouchStart, onTouchMove, onTouchEnd } };
}

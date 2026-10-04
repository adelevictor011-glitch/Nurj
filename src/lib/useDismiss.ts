import { useEffect, useRef } from 'react';

let locks = 0;

/**
 * For overlays (menus, readers, confirm dialogs): while `open`, Escape closes
 * it and the page behind stops scrolling, so the overlay is the only thing
 * that moves and nothing gets trapped underneath it.
 */
export function useDismiss(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    locks += 1;
    document.documentElement.classList.add('scroll-locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      locks = Math.max(0, locks - 1);
      if (!locks) document.documentElement.classList.remove('scroll-locked');
    };
  }, [open]);
}

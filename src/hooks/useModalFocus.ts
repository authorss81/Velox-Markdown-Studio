import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Gives a modal everything it needs to behave like a dialog:
 * - moves focus inside on open (first control, else the dialog itself),
 * - traps Tab / Shift+Tab inside,
 * - closes on Escape,
 * - returns focus to whatever opened it.
 *
 * Previously no modal had any of this: keyboard users who opened Export, the
 * sample library, shortcuts or the lightbox could Tab straight out into the
 * editor behind it, Escape closed only the command palette, and focus never
 * came back to the trigger. Returns a ref to attach to the dialog element,
 * which must be focusable (tabIndex={-1}) for the fallback path.
 */
export function useModalFocus<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const triggerRef = useRef<Element | null>(null);
  // Callers pass inline onClose closures, so the effect must not depend on its
  // identity: re-running on every parent render would yank focus back to the
  // first control while the user is interacting with the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    triggerRef.current = document.activeElement;

    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables[0] ?? dialog).focus();

    const visible = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = visible();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const trigger = triggerRef.current as HTMLElement | null;
      trigger?.focus?.();
    };
  }, [isOpen]);

  return dialogRef;
}

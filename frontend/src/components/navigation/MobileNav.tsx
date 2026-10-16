import { useLocale } from '@/context/LocaleContext';
import React, { useState, useEffect, useRef, useId } from 'react';
import { NavLink } from 'react-router-dom';
import { createPortal } from 'react-dom';
import styles from './MobileNav.module.css';

export interface MobileNavItem {
  to: string;
  label: string;
  icon?: React.ReactNode;
  end?: boolean;
}

export interface MobileNavProps {
  items: MobileNavItem[];
  portalTitle: string;
  portalBadge?: string;
  footerContent?: React.ReactNode;
}

export function MobileNav({ items, portalTitle, portalBadge, footerContent }: MobileNavProps) {
  const {t}=useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();

  // Close on Escape & trap focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const available=Array.from(focusable).filter(el=>!el.matches(':disabled,[hidden]') && el.getClientRects().length>0);
        if (!available.length) {e.preventDefault();return;}

        const first = available[0];
        const last = available[available.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === drawerRef.current) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last || document.activeElement === drawerRef.current) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const timer=setTimeout(()=>drawerRef.current?.focus(),0);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  const closeDrawer = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={drawerId}
        aria-label={t.phase1.navOpen}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div
            data-theme={triggerRef.current?.closest('[data-theme]')?.getAttribute('data-theme') || undefined}
            className={styles.overlay}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDrawer();
            }}
          >
            <div
              ref={drawerRef}
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-label={portalTitle}
              tabIndex={-1}
              className={styles.drawer}
            >
              <div className={styles.drawerHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <span aria-hidden="true">🛡️</span>
                  <span className={styles.title}>{portalTitle}</span>
                  {portalBadge && (
                    <span className="badge badge-primary">{portalBadge}</span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={closeDrawer}
                  aria-label={t.phase1.navClose}
                >
                  ✕
                </button>
              </div>

              <nav className={styles.navBody} aria-label={t.phase1.navLinks}>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    onClick={closeDrawer}
                    className={({ isActive }) =>
                      [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
                    }
                  >
                    {item.icon && <span aria-hidden="true">{item.icon}</span>}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>

              {footerContent && <div className={styles.drawerFooter}>{footerContent}</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

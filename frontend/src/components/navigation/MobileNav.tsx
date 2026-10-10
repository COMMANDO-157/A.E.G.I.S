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
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === drawerRef.current) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
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
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
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
        aria-label="Open mobile navigation menu"
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
              aria-label={`${portalTitle} navigation`}
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
                  aria-label="Close navigation"
                >
                  ✕
                </button>
              </div>

              <nav className={styles.navBody} aria-label="Mobile Navigation Links">
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

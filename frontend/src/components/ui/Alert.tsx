import React from 'react';
import styles from './Alert.module.css';

export type AlertVariant = 'information' | 'success' | 'warning' | 'error';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  onDismiss?: () => void;
  children: React.ReactNode;
}

const DEFAULT_ICONS: Record<AlertVariant, string> = {
  information: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '🛑',
};

export function Alert({
  variant = 'information',
  title,
  onDismiss,
  children,
  className,
  ...rest
}: AlertProps) {
  const isAssertive = variant === 'error';
  const role = isAssertive ? 'alert' : 'status';
  const ariaLive = isAssertive ? 'assertive' : 'polite';

  const classes = [styles.alert, styles[variant], className ?? ''].filter(Boolean).join(' ');

  return (
    <div
      role={role}
      aria-live={ariaLive}
      className={classes}
      {...rest}
    >
      <span className={styles.icon} aria-hidden="true">
        {DEFAULT_ICONS[variant]}
      </span>
      <div className={styles.content}>
        {title && <div className={styles.title}>{title}</div>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={styles.closeBtn}
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}

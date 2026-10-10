import React from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'neutral' | 'information' | 'success' | 'warning' | 'critical';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  withDot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function Badge({
  variant = 'neutral',
  withDot = true,
  icon,
  children,
  className,
  ...rest
}: BadgeProps) {
  const classes = [styles.badge, styles[variant], className ?? ''].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {withDot && !icon && <span className={styles.dot} aria-hidden="true" />}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

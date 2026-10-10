import React from 'react';
import styles from './StatusIndicator.module.css';

export type StatusType = 'active' | 'pending' | 'critical' | 'resolved' | 'neutral';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusType;
  label: string;
}

const STATUS_GLYPHS: Record<StatusType, string> = {
  active: '✓',
  pending: '⏳',
  critical: '!',
  resolved: '🛡',
  neutral: '•',
};

export function StatusIndicator({
  status,
  label,
  className,
  ...rest
}: StatusIndicatorProps) {
  const glyph = STATUS_GLYPHS[status];

  return (
    <span
      className={[styles.statusIndicator, styles[status], className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      <span className={styles.glyph} aria-hidden="true">
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  );
}

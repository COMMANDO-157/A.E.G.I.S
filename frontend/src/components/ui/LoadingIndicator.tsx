import React from 'react';
import styles from './LoadingIndicator.module.css';

export type LoadingSize = 'sm' | 'md' | 'lg';

export interface LoadingIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: LoadingSize;
  label?: string;
}

export function LoadingIndicator({
  size = 'md',
  label = 'Loading...',
  className,
  ...rest
}: LoadingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[styles.wrapper, className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      <span className={[styles.spinner, styles[size]].join(' ')} aria-hidden="true" />
      {label && <span className={styles.text}>{label}</span>}
      <span className="sr-only">{label}</span>
    </div>
  );
}

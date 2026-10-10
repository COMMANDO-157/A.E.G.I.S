import React from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon = '📭',
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div className={[styles.wrapper, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <div className={styles.textContent}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

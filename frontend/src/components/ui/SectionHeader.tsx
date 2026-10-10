import React from 'react';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function SectionHeader({
  title,
  description,
  action,
  className,
  ...rest
}: SectionHeaderProps) {
  return (
    <div className={[styles.header, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      <div className={styles.textGroup}>
        <h2 className={styles.title}>{title}</h2>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

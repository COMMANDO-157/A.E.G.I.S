import React from 'react';
import styles from './PageContainer.module.css';

export type PageContainerWidth = 'narrow' | 'default' | 'full';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: PageContainerWidth;
  children: React.ReactNode;
}

export function PageContainer({
  width = 'default',
  children,
  className,
  ...rest
}: PageContainerProps) {
  const classes = [styles.container, styles[width], className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

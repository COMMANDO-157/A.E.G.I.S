import React from 'react';
import styles from './Card.module.css';

export type CardVariant = 'standard' | 'elevated' | 'interactive';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: React.ReactNode;
}

export function Card({
  variant = 'standard',
  children,
  className,
  ...rest
}: CardProps) {
  const classes = [styles.card, styles[variant], className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.header, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.body, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.footer, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

import React, { useId } from 'react';
import styles from './CheckboxField.module.css';

export interface CheckboxFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  error?: string;
}

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ label, description, error, id: customId, disabled, className, ...rest }, ref) => {
    const generatedId = useId();
    const id = customId ?? generatedId;
    const descId = `${id}-desc`;
    const errorId = `${id}-error`;

    const describedBy = [
      description ? descId : '',
      error ? errorId : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div>
        <label
          htmlFor={id}
          className={[styles.container, disabled ? styles.disabled : '', className ?? ''].filter(Boolean).join(' ')}
        >
          <input
            ref={ref}
            type="checkbox"
            id={id}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            className={styles.checkbox}
            {...rest}
          />
          <span className={styles.textGroup}>
            <span className={styles.label}>{label}</span>
            {description && (
              <span id={descId} className={styles.description}>
                {description}
              </span>
            )}
          </span>
        </label>
        {error && (
          <div id={errorId} className={styles.errorText} role="alert">
            {error}
          </div>
        )}
      </div>
    );
  },
);

CheckboxField.displayName = 'CheckboxField';

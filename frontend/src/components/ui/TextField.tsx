import React, { useId } from 'react';
import styles from './TextField.module.css';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helpText?: string;
  error?: string;
  required?: boolean;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, helpText, error, required, id: customId, disabled, className, ...rest }, ref) => {
    const generatedId = useId();
    const id = customId ?? generatedId;
    const helpId = `${id}-help`;
    const errorId = `${id}-error`;

    const describedBy = [
      helpText ? helpId : '',
      error ? errorId : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={styles.wrapper}>
        <div className={styles.labelRow}>
          <label htmlFor={id} className={styles.label}>
            {label}
            {required && <span className={styles.required} aria-hidden="true">*</span>}
          </label>
        </div>

        <div className={styles.inputContainer}>
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-required={required ? 'true' : undefined}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            className={[styles.input, error ? styles.hasError : '', className ?? ''].filter(Boolean).join(' ')}
            {...rest}
          />
        </div>

        {error && (
          <div id={errorId} className={styles.errorText} role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {helpText && !error && (
          <div id={helpId} className={styles.helpText}>
            {helpText}
          </div>
        )}
      </div>
    );
  },
);

TextField.displayName = 'TextField';

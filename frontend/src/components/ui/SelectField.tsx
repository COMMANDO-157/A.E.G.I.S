import React, { useId } from 'react';
import styles from './SelectField.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  placeholder?: string;
  options?: SelectOption[];
  helpText?: string;
  error?: string;
  required?: boolean;
}

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      label,
      placeholder,
      options,
      helpText,
      error,
      required,
      id: customId,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
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

        <div className={styles.selectContainer}>
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-required={required ? 'true' : undefined}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            className={[styles.select, error ? styles.hasError : '', className ?? ''].filter(Boolean).join(' ')}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <span className={styles.chevron} aria-hidden="true">
            ▼
          </span>
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

SelectField.displayName = 'SelectField';

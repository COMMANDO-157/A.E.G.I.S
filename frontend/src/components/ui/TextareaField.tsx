import React, { useId, useState } from 'react';
import styles from './TextareaField.module.css';

export interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helpText?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  showCharCount?: boolean;
}

export const TextareaField = React.forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  (
    {
      label,
      helpText,
      error,
      required,
      maxLength,
      showCharCount = false,
      id: customId,
      disabled,
      className,
      value,
      defaultValue,
      onChange,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = customId ?? generatedId;
    const helpId = `${id}-help`;
    const errorId = `${id}-error`;
    const counterId = `${id}-counter`;

    const [currentLength, setCurrentLength] = useState<number>(() => {
      if (typeof value === 'string') return value.length;
      if (typeof defaultValue === 'string') return defaultValue.length;
      return 0;
    });

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCurrentLength(e.target.value.length);
      onChange?.(e);
    };

    const isLimitReached = maxLength !== undefined && currentLength >= maxLength;

    const describedBy = [
      helpText ? helpId : '',
      error ? errorId : '',
      showCharCount ? counterId : '',
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
          {showCharCount && maxLength && (
            <span
              id={counterId}
              className={[styles.charCount, isLimitReached ? styles.charLimitReached : ''].join(' ')}
              aria-live="polite"
            >
              {currentLength} / {maxLength}
            </span>
          )}
        </div>

        <textarea
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          aria-required={required ? 'true' : undefined}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className={[styles.textarea, error ? styles.hasError : '', className ?? ''].filter(Boolean).join(' ')}
          {...rest}
        />

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

TextareaField.displayName = 'TextareaField';

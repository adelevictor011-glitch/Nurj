// Shared building blocks for the naira calculators.
import type { ReactNode } from 'react';

export const naira = (value: number) => `${value < 0 ? '−' : ''}₦${Math.round(Math.abs(value)).toLocaleString('en-NG')}`;
export const percent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
export const count = (value: number) => Math.round(value).toLocaleString('en-NG');

export function Field({ label, value, onChange, hint, suffix }: { label: string; value: string; onChange: (value: string) => void; hint?: string; suffix?: string }) {
  return (
    <label className="calc-field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input className="field" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Choice<T extends string>({ label, value, onChange, options, hint }: { label: string; value: T; onChange: (value: T) => void; options: Array<[T, string]>; hint?: ReactNode }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** The answer box: one headline, then supporting lines. `warn` turns the headline red. */
export function Result({ headline, warn, children }: { headline: ReactNode; warn?: boolean; children?: ReactNode }) {
  return (
    <div className="calc-result">
      <strong className={warn ? 'calc-warn' : undefined}>{headline}</strong>
      {children}
    </div>
  );
}

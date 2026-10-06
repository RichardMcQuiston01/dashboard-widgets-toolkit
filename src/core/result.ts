/**
 * A small Result type. Functions in this package return a Result rather than
 * throwing, so the caller has to look at the outcome. `throw` is reserved for
 * programmer error.
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err {
  readonly ok: false;
  /** Specific enough to act on: names the field, the widget and the problem. */
  readonly error: string;
}

export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: string): Err {
  return { ok: false, error };
}

/** Turns an unknown thrown value into a readable message. */
export function describeUnknownError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message === '' ? cause.name : cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  try {
    const json: string | undefined = JSON.stringify(cause);
    return json ?? String(cause);
  } catch {
    return String(cause);
  }
}

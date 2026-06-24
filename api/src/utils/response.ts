/**
 * JSend format specification (https://github.com/omniti-labs/jsend)
 */

export interface JSendSuccess<T> {
  status: 'success';
  data: T;
  meta?: Record<string, unknown>;
}

export interface JSendFail<T> {
  status: 'fail';
  data: T;
}

export interface JSendError {
  status: 'error';
  message: string;
  code?: number;
  data?: unknown;
}

export type JSendResponse<T> = JSendSuccess<T> | JSendFail<T> | JSendError;

/**
 * Wraps successful data in a JSend success object.
 */
export function success<T>(data: T, meta?: Record<string, unknown>): JSendSuccess<T> {
  return {
    status: 'success',
    data,
    ...(meta ? { meta } : {}),
  };
}

/**
 * Wraps validation/business errors in a JSend fail object.
 */
export function fail<T>(data: T): JSendFail<T> {
  return {
    status: 'fail',
    data,
  };
}

/**
 * Wraps server/unexpected errors in a JSend error object.
 */
export function error(message: string, code?: number, data?: unknown): JSendError {
  return {
    status: 'error',
    message,
    ...(code ? { code } : {}),
    ...(data ? { data } : {}),
  };
}

/**
 * A helper to pick only essential fields for 'compact' views
 */
export function compactObject<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): Partial<T> {
  const result: Partial<T> = {};
  for (const field of fields) {
    if (obj[field] !== undefined) {
      result[field] = obj[field];
    }
  }
  return result;
}

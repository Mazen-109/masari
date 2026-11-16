export type ErrorCode =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'account_suspended'
  | 'tenant_suspended'
  | 'token_invalid'
  | 'internal';

export type FieldErrorCode =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'invalid_format'
  | 'invalid_email'
  | 'invalid_choice'
  | 'out_of_range'
  | 'password_too_short'
  | 'password_too_long'
  | 'consent_required'
  | 'domain_not_allowed'
  | 'email_unavailable'
  | 'student_code_taken'
  | 'code_taken'
  | 'levels_in_use'
  | 'too_many';

export type ActionFailure = {
  ok: false;
  code: ErrorCode;
  fieldErrors?: Record<string, FieldErrorCode>;
  retryAfterSeconds?: number;
  meta?: Record<string, string | number>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

export type FailExtra = Pick<ActionFailure, 'fieldErrors' | 'retryAfterSeconds' | 'meta'>;

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (code: ErrorCode, extra?: FailExtra): ActionResult<never> => {
  const result: ActionFailure = { ok: false, code };
  if (extra?.fieldErrors !== undefined) result.fieldErrors = extra.fieldErrors;
  if (extra?.retryAfterSeconds !== undefined) result.retryAfterSeconds = extra.retryAfterSeconds;
  if (extra?.meta !== undefined) result.meta = extra.meta;
  return result;
};

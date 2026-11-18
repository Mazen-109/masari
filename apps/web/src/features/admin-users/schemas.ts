import { ROLES, USER_STATUSES, type Role, type UserStatus } from '@masari/db';
import { z } from 'zod';

/**
 * Query parameters of the People screen (contracts/routes.md §4; FR-029): `q` (trimmed, 1–100 characters),
 * `role` (one of the four roles), `status` (`active` | `suspended`), `page` (whole number ≥ 1). An invalid
 * value — also a repeated parameter (an array) — is treated as absent, and an invalid page as page 1, so a
 * hand-edited URL never fails the screen.
 */

/** Rows per page of the People screen (FR-029). */
export const USERS_PAGE_SIZE = 20;

/**
 * Highest page number taken from the URL (200,000 accounts at 20 per page, far above any college); a larger
 * one is invalid and becomes page 1. Keeps the offset small and `listInTenant`'s RangeError unreachable.
 */
export const MAX_USERS_PAGE = 10_000;

/** Longest search term (characters, after trimming). */
export const MAX_SEARCH_LENGTH = 100;

export const usersFilterSchema = z.object({
  q: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional().catch(undefined),
  role: z.enum(ROLES).optional().catch(undefined),
  status: z.enum(USER_STATUSES).optional().catch(undefined),
  page: z
    .string()
    .regex(/^\d{1,6}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_USERS_PAGE))
    .catch(1),
});

export type UsersFilterParams = Readonly<{
  q?: string;
  role?: Role;
  status?: UserStatus;
  page: number;
}>;

/** The filters of the URL's search params (Next.js `searchParams`); never throws. */
export function parseUsersFilter(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): UsersFilterParams {
  const { q, role, status, page } = usersFilterSchema.parse(searchParams);
  return {
    page,
    ...(q === undefined ? {} : { q }),
    ...(role === undefined ? {} : { role }),
    ...(status === undefined ? {} : { status }),
  };
}

/**
 * The query string (with its leading `?`, or empty) of the People screen for these filters at `page`:
 * absent filters and page 1 are left out, so links stay short and the first page has one URL.
 */
export function usersQueryString(filter: Omit<UsersFilterParams, 'page'>, page: number): string {
  const params = new URLSearchParams();
  if (filter.q !== undefined) params.set('q', filter.q);
  if (filter.role !== undefined) params.set('role', filter.role);
  if (filter.status !== undefined) params.set('status', filter.status);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** Number of pages for `total` accounts (at least 1, so an empty list is "page 1 of 1"). */
export function pageCount(total: number, pageSize = USERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ---------------------------------------------------------------------------------------------------------
// Row actions (contracts/server-actions.md §5.3; FR-030, FR-031). Every issue message is a FieldErrorCode;
// `parseForm` (lib/form.ts) keeps the first one per field.

/**
 * The target account's id, from a hidden field. Only its presence and length are checked: an id the
 * college does not have is an unknown account, which the action answers with `not_found`.
 */
const userIdField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .max(64, { error: 'too_long' });

/** The role dialog (`changeUserRoleAction`): the account and its new role, one of the four. */
export const changeRoleSchema = z.object({
  userId: userIdField,
  role: z
    .string({ error: 'invalid_choice' })
    .trim()
    .pipe(z.enum(ROLES, { error: 'invalid_choice' })),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

/** The suspend and reactivate forms (`setUserStatusAction`): the account and its new status. */
export const setStatusSchema = z.object({
  userId: userIdField,
  status: z
    .string({ error: 'invalid_choice' })
    .trim()
    .pipe(z.enum(USER_STATUSES, { error: 'invalid_choice' })),
});

export type SetStatusInput = z.infer<typeof setStatusSchema>;

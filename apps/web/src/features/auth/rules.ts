/** Pure email rules of the account flows (FR-001, FR-003). */

/** The stored form of an address: trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The part after the last `@`, normalised; empty when there is none. */
export function emailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  return at === -1 ? '' : normalized.slice(at + 1);
}

/**
 * True when the college accepts the address: no domain list means every domain is accepted; otherwise the
 * domain must equal one of the list exactly (case-insensitive) — a sub-domain is not a match.
 */
export function isEmailDomainAllowed(email: string, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const domain = emailDomain(email);
  return domain !== '' && domains.some((allowed) => normalizeEmail(allowed) === domain);
}

/**
 * The college the registration form fixes (FR-002): the one whose slug is `u` (the `?u=` query; a repeated
 * parameter matches nothing), otherwise the only option when exactly one active college exists; null shows
 * the picker.
 */
export function pickCollege<T extends { slug: string }>(
  options: readonly T[],
  u: string | string[] | undefined,
): T | null {
  const bySlug = typeof u === 'string' ? options.find((option) => option.slug === u) : undefined;
  return bySlug ?? (options.length === 1 ? (options[0] ?? null) : null);
}

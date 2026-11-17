import { audit, withTenant, type Tx } from '@masari/db';
import type { SessionContext } from '@/server/auth/session';
import { getClientIp } from '@/server/request';

/**
 * Audit log of the web app (data-model.md §3.8, research.md §20, FR-044). Only actions of the catalogue
 * below are written; metadata is limited to the keys listed for the action and to IDs and enumerations:
 * strings of at most 64 characters, numbers, booleans, and short string lists. Never emails, names, tokens,
 * or passwords.
 */

export type AuditTargetType = 'user' | 'invitation' | 'division' | 'tenant' | 'student_profile';

/** Action → target type and the metadata keys it may carry. */
export const AUDIT_CATALOGUE = {
  'user.registered': { target: 'user', keys: [] },
  'auth.sign_in': { target: 'user', keys: [] },
  'auth.sign_out': { target: 'user', keys: [] },
  'auth.password_reset_requested': { target: 'user', keys: [] },
  'auth.password_reset': { target: 'user', keys: [] },
  'invitation.created': { target: 'invitation', keys: ['role'] },
  'invitation.revoked': { target: 'invitation', keys: [] },
  'invitation.accepted': { target: 'invitation', keys: ['role'] },
  'user.role_changed': { target: 'user', keys: ['from', 'to'] },
  'user.suspended': { target: 'user', keys: [] },
  'user.reactivated': { target: 'user', keys: [] },
  'profile.created': { target: 'student_profile', keys: [] },
  'profile.updated': { target: 'student_profile', keys: ['fields'] },
  'tenant.settings_updated': { target: 'tenant', keys: ['fields'] },
  'tenant.modules_updated': { target: 'tenant', keys: ['enabled'] },
  'division.created': { target: 'division', keys: ['fields'] },
  'division.updated': { target: 'division', keys: ['fields'] },
  'division.activated': { target: 'division', keys: [] },
  'division.deactivated': { target: 'division', keys: [] },
} as const satisfies Record<string, { target: AuditTargetType; keys: readonly string[] }>;

export type AuditAction = keyof typeof AUDIT_CATALOGUE;

export const MAX_METADATA_STRING_LENGTH = 64;
export const MAX_METADATA_LIST_LENGTH = 20;

export type AuditMetadataValue = string | number | boolean | readonly string[];

type MetadataKey<A extends AuditAction> = (typeof AUDIT_CATALOGUE)[A]['keys'][number];

export type AuditEvent<A extends AuditAction = AuditAction> = {
  action: A;
  /** Id of the affected row; the target type comes from the catalogue. */
  targetId: string;
  /**
   * Keys whose value is `undefined` are left out, so optional metadata can be written inline; the key
   * must still be one the catalogue allows for the action.
   */
  metadata?: Partial<Record<MetadataKey<A>, AuditMetadataValue | undefined>>;
};

/** Who acts and in which college: a session context, or explicit ids (userId null = system). */
export type AuditActor = SessionContext | { tenantId: string; userId: string | null };

export class AuditEventError extends Error {
  constructor(reason: string) {
    super(`recordAudit: ${reason}`);
    this.name = 'AuditEventError';
  }
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && [...value].length <= MAX_METADATA_STRING_LENGTH;
}

/** Throws AuditEventError unless the event matches the catalogue; messages never contain the values. */
export function assertValidAuditEvent(event: AuditEvent): void {
  if (!Object.hasOwn(AUDIT_CATALOGUE, event.action)) {
    throw new AuditEventError('unknown action');
  }
  if (!isShortString(event.targetId) || event.targetId === '') {
    throw new AuditEventError('targetId must be 1–64 characters');
  }
  const allowed: readonly string[] = AUDIT_CATALOGUE[event.action].keys;
  for (const [key, value] of Object.entries(event.metadata ?? {})) {
    if (!allowed.includes(key)) throw new AuditEventError(`metadata key "${key}" not allowed`);
    if (value === undefined) continue;
    const valid =
      typeof value === 'number'
        ? Number.isFinite(value)
        : typeof value === 'boolean' ||
          isShortString(value) ||
          (Array.isArray(value) &&
            value.length <= MAX_METADATA_LIST_LENGTH &&
            value.every((item) => isShortString(item)));
    if (!valid) throw new AuditEventError(`metadata "${key}" is not a short ID or enumeration`);
  }
}

/** The event's metadata without the keys whose value is `undefined`. */
function definedMetadata(event: AuditEvent): Record<string, AuditMetadataValue> {
  const metadata: Record<string, AuditMetadataValue> = {};
  for (const [key, value] of Object.entries(event.metadata ?? {})) {
    if (value !== undefined) metadata[key] = value;
  }
  return metadata;
}

async function clientIpOrNull(): Promise<string | null> {
  try {
    return await getClientIp();
  } catch {
    // Outside a request (no headers to read): the address is unknown.
    return null;
  }
}

/**
 * Records one audit event. With `tx`, it is written in the caller's withTenant transaction so the change
 * and its audit row commit or roll back together (the row's college is that transaction's tenant context);
 * without `tx`, it opens its own withTenant for the actor's college. Adds the client IP, or NULL.
 */
export async function recordAudit<A extends AuditAction>(
  actor: AuditActor,
  event: AuditEvent<A>,
  tx?: Tx,
): Promise<void> {
  assertValidAuditEvent(event);
  const { tenantId, userId } =
    'user' in actor ? { tenantId: actor.tenant.id, userId: actor.user.id } : actor;
  const input = {
    actorUserId: userId,
    action: event.action,
    targetType: AUDIT_CATALOGUE[event.action].target,
    targetId: event.targetId,
    metadata: definedMetadata(event),
    ip: await clientIpOrNull(),
  };
  if (tx !== undefined) {
    await audit.record(tx, input);
    return;
  }
  await withTenant({ tenantId, userId }, (ownTx) => audit.record(ownTx, input));
}

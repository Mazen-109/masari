import type { AuditEventInput } from '../constants';
import type { Tx } from '../context';
import { auditEvents } from '../schema';

/**
 * Append-only audit log of the college in context (contracts/db-api.md §1.6, data-model.md §3.8). The runtime
 * role may only insert and read; tenant_id comes from the column default app_tenant_id(), so an event is
 * always recorded in the college of the surrounding withTenant and cannot be written into another one.
 * Which actions and metadata are allowed is checked by the web app's recordAudit (catalogue of §3.8).
 */
export async function record(tx: Tx, event: AuditEventInput): Promise<void> {
  await tx.insert(auditEvents).values({
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    metadata: event.metadata ?? {},
    ip: event.ip ?? null,
  });
}

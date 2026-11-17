import { afterAll, describe, expect, it } from 'vitest';
import { withOwnerTransaction } from '../src/admin/owner';
import { getAdminDbEnv } from '../src/env';
import { closeTestPools, ownerQuery, randomSlug } from './helpers';

// withOwnerTransaction (admin/owner.ts): commits on success, rolls back on failure, and the caller always
// sees fn's own error — also when the connection broke and ROLLBACK itself fails.

afterAll(closeTestPools);

function migrationUrl(): string {
  return getAdminDbEnv().DATABASE_MIGRATION_URL;
}

async function tenantExists(slug: string): Promise<boolean> {
  const result = await ownerQuery('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
  return result.rowCount === 1;
}

const INSERT_TENANT = `INSERT INTO tenants (slug, name_ar, name_en) VALUES ($1, 'أ', 'A')`;

describe('withOwnerTransaction', () => {
  it('commits and returns the result of fn', async () => {
    const slug = randomSlug('own');
    const result = await withOwnerTransaction(migrationUrl(), async (client) => {
      await client.query(INSERT_TENANT, [slug]);
      return 'done';
    });
    expect(result).toBe('done');
    expect(await tenantExists(slug)).toBe(true);
  });

  it('rolls back and rethrows the error of fn', async () => {
    const slug = randomSlug('own');
    await expect(
      withOwnerTransaction(migrationUrl(), async (client) => {
        await client.query(INSERT_TENANT, [slug]);
        throw new Error('original failure');
      }),
    ).rejects.toThrow('original failure');
    expect(await tenantExists(slug)).toBe(false);
  });

  it('keeps the original error when the connection is lost and ROLLBACK fails', async () => {
    const slug = randomSlug('own');
    await expect(
      withOwnerTransaction(migrationUrl(), async (client) => {
        await client.query(INSERT_TENANT, [slug]);
        // The server ends this very connection; the query fails and the client becomes unusable.
        await client.query('SELECT pg_terminate_backend(pg_backend_pid())').catch(() => undefined);
        throw new Error('original failure');
      }),
    ).rejects.toThrow('original failure');
    // The transaction was never committed.
    expect(await tenantExists(slug)).toBe(false);
  });
});

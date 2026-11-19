import { afterAll, describe, expect, it } from 'vitest';
import { withTenant, type Tx } from '../src/context';
import * as divisions from '../src/repositories/divisions';
import * as studentProfiles from '../src/repositories/student-profiles';
import * as tenants from '../src/repositories/tenants';
import {
  closeTestPools,
  inRuntimeTransaction,
  makeTenant,
  makeUser,
  ownerQuery,
  pgErrorCode,
  randomSlug,
  runtimeQuery,
} from './helpers';

// contracts/db-api.md §4: public listing hides suspended colleges; updateSettings changes only the current
// college; the runtime role cannot insert/delete colleges nor update slug/status.

afterAll(closeTestPools);

async function storedRow(id: string) {
  const result = await ownerQuery(
    `SELECT slug, name_ar, name_en, status, allowed_email_domains, levels_count, enabled_modules, updated_at
       FROM tenants WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

describe('tenants.listActivePublic', () => {
  it('lists active colleges with public fields only, ordered by Arabic name, hiding suspended ones', async () => {
    const second = await makeTenant({ nameAr: 'كلية ب', nameEn: 'B College' });
    const first = await makeTenant({ nameAr: 'كلية أ', nameEn: 'A College' });
    const suspended = await makeTenant({ status: 'suspended' });

    const list = await tenants.listActivePublic();
    const mine = list.filter((row) => [first.id, second.id, suspended.id].includes(row.id));
    expect(mine).toEqual([
      { id: first.id, slug: first.slug, nameAr: 'كلية أ', nameEn: 'A College' },
      { id: second.id, slug: second.slug, nameAr: 'كلية ب', nameEn: 'B College' },
    ]);
  });
});

describe('tenants.findBySlug / findById', () => {
  it('returns the full college by slug and by id', async () => {
    const college = await makeTenant({ nameEn: 'Lookup College' });
    const bySlug = await tenants.findBySlug(college.slug);
    expect(bySlug).toMatchObject({
      id: college.id,
      slug: college.slug,
      nameEn: 'Lookup College',
      status: 'active',
      allowedEmailDomains: [],
      levelsCount: 4,
      enabledModules: ['mueed', 'codejudge', 'mizan', 'kitabi', 'careermap', 'tadreeb'],
    });
    expect(bySlug?.createdAt).toBeInstanceOf(Date);
    expect(await tenants.findById(college.id)).toEqual(bySlug);
  });

  it('returns suspended colleges too (callers decide what suspension means)', async () => {
    const college = await makeTenant({ status: 'suspended' });
    expect((await tenants.findBySlug(college.slug))?.status).toBe('suspended');
  });

  it('returns null for unknown slugs and ids, and for ids that are not uuids', async () => {
    expect(await tenants.findBySlug(randomSlug('missing'))).toBeNull();
    expect(await tenants.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await tenants.findById('not-a-uuid')).toBeNull();
  });
});

describe('tenants.updateSettings', () => {
  it('changes only the college in context and sets updated_at', async () => {
    const collegeA = await makeTenant();
    const collegeB = await makeTenant();
    await ownerQuery(`UPDATE tenants SET updated_at = now() - interval '1 day' WHERE id = $1`, [
      collegeA.id,
    ]);
    const beforeA = await storedRow(collegeA.id);
    const beforeB = await storedRow(collegeB.id);

    const updated = await withTenant({ tenantId: collegeA.id, userId: null }, (tx) =>
      tenants.updateSettings(tx, {
        nameAr: 'كلية الحاسبات',
        nameEn: 'Faculty of Computing',
        allowedEmailDomains: ['fci.example.edu'],
        levelsCount: 5,
        enabledModules: ['mueed', 'kitabi'],
      }),
    );

    expect(updated).toMatchObject({
      id: collegeA.id,
      slug: collegeA.slug,
      status: 'active',
      nameAr: 'كلية الحاسبات',
      nameEn: 'Faculty of Computing',
      allowedEmailDomains: ['fci.example.edu'],
      levelsCount: 5,
      enabledModules: ['mueed', 'kitabi'],
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan((beforeA?.updated_at as Date).getTime());
    expect(await storedRow(collegeB.id)).toEqual(beforeB);
  });

  it('leaves columns missing from the patch unchanged', async () => {
    const college = await makeTenant({ nameEn: 'Keep Me' });
    const updated = await withTenant({ tenantId: college.id, userId: null }, (tx) =>
      tenants.updateSettings(tx, { levelsCount: 7 }),
    );
    expect(updated).toMatchObject({ nameEn: 'Keep Me', levelsCount: 7 });
  });

  it('ignores slug and status smuggled into the patch at run time', async () => {
    const college = await makeTenant();
    const patch = { nameEn: 'Renamed', slug: randomSlug('hijack'), status: 'suspended' };
    const updated = await withTenant({ tenantId: college.id, userId: null }, (tx) =>
      tenants.updateSettings(tx, patch),
    );
    expect(updated).toMatchObject({ nameEn: 'Renamed', slug: college.slug, status: 'active' });
  });

  it('enforces the CHECK constraints of data-model.md §3.1', async () => {
    const college = await makeTenant();
    const code = await pgErrorCode(
      withTenant({ tenantId: college.id, userId: null }, (tx) =>
        tenants.updateSettings(tx, { levelsCount: 8 }),
      ),
    );
    expect(code).toBe('23514');
  });

  it('throws when the context names a college that does not exist', async () => {
    await expect(
      withTenant({ tenantId: '00000000-0000-4000-8000-000000000000', userId: null }, (tx) =>
        tenants.updateSettings(tx, { nameEn: 'Ghost' }),
      ),
    ).rejects.toThrow('no college in the current tenant context');
  });
});

describe('tenants.findCurrentForUpdate', () => {
  it('returns the college in context, as findById does', async () => {
    const college = await makeTenant({ nameEn: 'Locked College' });
    await makeTenant();
    const found = await withTenant({ tenantId: college.id, userId: null }, (tx) =>
      tenants.findCurrentForUpdate(tx),
    );
    expect(found).toEqual(await tenants.findById(college.id));
    expect(found).toMatchObject({ id: college.id, nameEn: 'Locked College' });
  });

  it('returns null when the context names no college', async () => {
    await expect(
      withTenant({ tenantId: '00000000-0000-4000-8000-000000000000', userId: null }, (tx) =>
        tenants.findCurrentForUpdate(tx),
      ),
    ).resolves.toBeNull();
  });

  it('holds the row until the transaction ends: a concurrent update of it waits', async () => {
    const college = await makeTenant();
    const order: string[] = [];
    let concurrent: Promise<unknown> = Promise.resolve();
    await withTenant({ tenantId: college.id, userId: null }, async (tx) => {
      await tenants.findCurrentForUpdate(tx);
      // Another connection (another transaction) tries to change the same college meanwhile.
      concurrent = withTenant({ tenantId: college.id, userId: null }, (other) =>
        tenants.updateSettings(other, { nameEn: 'Second' }),
      ).then(() => order.push('concurrent'));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await tenants.updateSettings(tx, { nameEn: 'First' });
      order.push('locked');
    });
    await concurrent;
    expect(order).toEqual(['locked', 'concurrent']);
    expect((await storedRow(college.id))?.name_en).toBe('Second');
  });
});

describe('tenants.findCurrentForShare (FR-032)', () => {
  /** A college with 4 levels and one student at level 1. */
  async function collegeWithStudent() {
    const college = await makeTenant();
    const student = await makeUser(college.id);
    await withTenant({ tenantId: college.id, userId: null }, async (tx) => {
      await tenants.updateSettings(tx, { levelsCount: 4 });
      const division = await divisions.create(tx, {
        code: 'GEN',
        nameAr: 'عام',
        nameEn: 'General',
        sortOrder: 0,
      });
      if (!division.ok) throw new Error('collegeWithStudent: division not created');
      const profile = await studentProfiles.create(tx, {
        userId: student.id,
        studentCode: 'LVL-01',
        level: 1,
        divisionId: division.value.id,
      });
      if (!profile.ok) throw new Error('collegeWithStudent: profile not created');
    });
    return { college, student };
  }

  /** The settings save of contracts/server-actions.md §5.4, reduced to the number of levels. */
  async function lowerLevels(tx: Tx, levelsCount: number): Promise<'saved' | 'levels_in_use'> {
    await tenants.findCurrentForUpdate(tx);
    if (levelsCount < (await studentProfiles.maxLevelInUse(tx))) return 'levels_in_use';
    await tenants.updateSettings(tx, { levelsCount });
    return 'saved';
  }

  /** The profile save's level rule, against the college row locked FOR SHARE. */
  async function raiseLevel(tx: Tx, userId: string, level: number): Promise<'saved' | 'refused'> {
    const college = await tenants.findCurrentForShare(tx);
    if (college === null || level > college.levelsCount) return 'refused';
    const updated = await studentProfiles.update(tx, userId, { level });
    return updated.ok ? 'saved' : 'refused';
  }

  it('returns the college in context, and null when the context names no college', async () => {
    const college = await makeTenant();
    const found = await withTenant({ tenantId: college.id, userId: null }, (tx) =>
      tenants.findCurrentForShare(tx),
    );
    expect(found).toEqual(await tenants.findById(college.id));
    await expect(
      withTenant({ tenantId: '00000000-0000-4000-8000-000000000000', userId: null }, (tx) =>
        tenants.findCurrentForShare(tx),
      ),
    ).resolves.toBeNull();
  });

  it('profile save first: a concurrent save lowering the levels waits, then sees the new level and refuses', async () => {
    const { college, student } = await collegeWithStudent();
    const ctx = { tenantId: college.id, userId: null };
    let settings: Promise<string> = Promise.resolve('not started');
    const profile = await withTenant(ctx, async (tx) => {
      const saved = await raiseLevel(tx, student.id, 4);
      settings = withTenant(ctx, (other) => lowerLevels(other, 3));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return saved;
    });
    expect(profile).toBe('saved');
    expect(await settings).toBe('levels_in_use');
    expect((await storedRow(college.id))?.levels_count).toBe(4);
  });

  it('settings save first: a concurrent profile save waits, then reads the lowered number and refuses', async () => {
    const { college, student } = await collegeWithStudent();
    const ctx = { tenantId: college.id, userId: null };
    let profile: Promise<string> = Promise.resolve('not started');
    const settings = await withTenant(ctx, async (tx) => {
      const saved = await lowerLevels(tx, 3);
      profile = withTenant(ctx, (other) => raiseLevel(other, student.id, 4));
      await new Promise((resolve) => setTimeout(resolve, 200));
      return saved;
    });
    expect(settings).toBe('saved');
    expect(await profile).toBe('refused');
    const level = await withTenant(ctx, (tx) => studentProfiles.maxLevelInUse(tx));
    expect(level).toBe(1);
  });

  it('does not make two profile saves wait for each other', async () => {
    const college = await makeTenant();
    const ctx = { tenantId: college.id, userId: null };
    const second = await withTenant(ctx, async (tx) => {
      await tenants.findCurrentForShare(tx);
      // Resolves while the first transaction still holds its lock.
      return withTenant(ctx, (other) => tenants.findCurrentForShare(other));
    });
    expect(second?.id).toBe(college.id);
  });
});

describe('runtime role limits on tenants', () => {
  it('cannot insert a college', async () => {
    const code = await pgErrorCode(
      runtimeQuery(`INSERT INTO tenants (slug, name_ar, name_en) VALUES ($1, 'س', 'S')`, [
        randomSlug('forbidden'),
      ]),
    );
    expect(code).toBe('42501');
  });

  it('cannot delete a college', async () => {
    const college = await makeTenant();
    expect(await pgErrorCode(runtimeQuery('DELETE FROM tenants WHERE id = $1', [college.id]))).toBe(
      '42501',
    );
    expect(await storedRow(college.id)).toBeDefined();
  });

  it('cannot update slug or status, even of the college in context', async () => {
    const college = await makeTenant();
    for (const statement of [
      `UPDATE tenants SET slug = 'hijacked-slug' WHERE id = $1`,
      `UPDATE tenants SET status = 'suspended' WHERE id = $1`,
    ]) {
      const code = await pgErrorCode(
        inRuntimeTransaction(async (client) => {
          await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [college.id]);
          return client.query(statement, [college.id]);
        }),
      );
      expect(code).toBe('42501');
    }
    expect(await storedRow(college.id)).toMatchObject({ slug: college.slug, status: 'active' });
  });

  it('updates no row of another college, nor any row without a context', async () => {
    const collegeA = await makeTenant();
    const collegeB = await makeTenant({ nameEn: 'Untouched' });
    const crossCollege = await inRuntimeTransaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [collegeA.id]);
      return client.query(`UPDATE tenants SET name_en = 'Hijacked' WHERE id = $1`, [collegeB.id]);
    });
    expect(crossCollege.rowCount).toBe(0);
    const noContext = await runtimeQuery(`UPDATE tenants SET name_en = 'Hijacked' WHERE id = $1`, [
      collegeB.id,
    ]);
    expect(noContext.rowCount).toBe(0);
    expect(await storedRow(collegeB.id)).toMatchObject({ name_en: 'Untouched' });
  });
});

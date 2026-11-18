import { ROLES, USER_STATUSES } from '@masari/db';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { MAX_SEARCH_LENGTH, type UsersFilterParams } from '../schemas';

/**
 * The filters of the People screen (FR-029): a plain GET form — it works without JavaScript and the
 * filters live in the URL, so a filtered list can be bookmarked or shared. Submitting starts again at page
 * 1 (no page field). The controls show the filters in effect; "Clear filters" appears while any is set.
 * The caller keys it by the filters: after a client-side navigation (a pagination or "Clear filters"
 * link) the uncontrolled controls are then rebuilt with the new values.
 */
export function UsersFilters({ filter }: Readonly<{ filter: Omit<UsersFilterParams, 'page'> }>) {
  const t = useTranslations('admin.users.filters');
  const tRoles = useTranslations('common.roles');
  const tStatuses = useTranslations('common.statuses');
  const filtered =
    filter.q !== undefined || filter.role !== undefined || filter.status !== undefined;

  return (
    <form method="get" role="search" aria-label={t('label')} className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field id="users-q" label={t('search')}>
          {(control) => (
            <Input
              {...control}
              name="q"
              type="search"
              // Names may be Arabic or English, emails and codes are Latin: follow what is typed.
              dir="auto"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_SEARCH_LENGTH}
              defaultValue={filter.q ?? ''}
            />
          )}
        </Field>

        <Field id="users-role" label={t('role')}>
          {(control) => (
            <Select {...control} name="role" defaultValue={filter.role ?? ''}>
              <option value="">{t('anyRole')}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {tRoles(role)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="users-status" label={t('status')}>
          {(control) => (
            <Select {...control} name="status" defaultValue={filter.status ?? ''}>
              <option value="">{t('anyStatus')}</option>
              {USER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tStatuses(status)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="w-full sm:w-auto">
          <Search aria-hidden="true" />
          {t('submit')}
        </Button>
        {filtered ? (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/admin/users" data-slot="users-clear">
              {t('clear')}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import type { ActionResult } from '@/lib/result';

/**
 * "Changes saved." after a successful form action of the profile screen (US2 scenario 5: the change is
 * visible immediately). A `role="status"` banner, so it is announced without moving focus; removed while
 * the next submission is being sent, so a second save is announced again.
 */
export function SavedStatus({
  result,
  pending,
}: Readonly<{ result: ActionResult | null; pending: boolean }>) {
  const t = useTranslations('profile');
  if (pending || result?.ok !== true) return null;
  return (
    <Alert variant="success" role="status" data-slot="saved-status">
      {t('saved')}
    </Alert>
  );
}

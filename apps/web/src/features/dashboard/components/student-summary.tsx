import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type StudentSummaryProps = Readonly<{
  studentCode: string;
  /** «الفرقة الثالثة» / "Level 3". */
  levelLabel: string;
  /** The division's name in the current language. */
  divisionName: string;
}>;

/**
 * The student's academic profile on the home screen (contracts/routes.md §4, FR-024): student code, level,
 * and division. The code is Latin text and is isolated (`dir="ltr"`) inside the Arabic layout.
 */
export function StudentSummary({ studentCode, levelLabel, divisionName }: StudentSummaryProps) {
  const t = useTranslations('dashboard.studentSummary');

  return (
    <Card data-slot="student-summary" className="max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h2>{t('title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{t('studentCode')}</dt>
            <dd className="font-medium" data-field="studentCode">
              <bdi dir="ltr">{studentCode}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{t('level')}</dt>
            <dd className="font-medium" data-field="level">
              {levelLabel}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{t('division')}</dt>
            <dd className="font-medium" data-field="division">
              {divisionName}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

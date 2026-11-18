'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DivisionForm, type EditableDivision } from './division-form';

const ltr = (chunks: ReactNode) => <bdi dir="ltr">{chunks}</bdi>;

/**
 * "Edit" of one row of the divisions table (FR-033): a dialog with the names and display order (the code
 * is shown in the description, never editable). Same trigger as the People screen's row actions (compact,
 * the division's code visually hidden in its accessible name). The form is mounted only while the dialog
 * is open, so every opening starts from the saved values with no error. Focus is trapped in the dialog,
 * Escape closes it, focus returns to the trigger, and a success is announced politely.
 */
export function EditDivisionDialog({ division }: Readonly<{ division: EditableDivision }>) {
  const t = useTranslations('admin.divisions.actions.edit');
  const tCommon = useTranslations('common.actions');
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  function handleOpenChange(next: boolean): void {
    if (next) setAnnouncement('');
    setOpen(next);
  }

  function handleDone(): void {
    setOpen(false);
    setAnnouncement(t('done'));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="compact" data-slot="division-edit-trigger">
            {t('open')}
            <span className="sr-only"> {t.rich('target', { code: division.code, ltr })}</span>
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={tCommon('close')} data-slot="division-edit-dialog">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>
              {t.rich('description', { code: division.code, ltr })}
            </DialogDescription>
          </DialogHeader>
          <DivisionForm
            mode="edit"
            division={division}
            onDone={handleDone}
            footer={(submit) => (
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{tCommon('cancel')}</Button>
                </DialogClose>
                {submit}
              </DialogFooter>
            )}
          />
        </DialogContent>
      </Dialog>
      <p role="status" className="sr-only" data-slot="division-edit-status">
        {announcement}
      </p>
    </>
  );
}

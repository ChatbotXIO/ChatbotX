"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { editFolderAction } from "@/features/folders/actions/edit-folder-action";
import { editFolderSchema, EditFolderSchema } from "@/features/folders/schemas/edit-folder-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { Folder } from "@prisma/client";
import { useTranslate } from '@tolgee/react';
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function EditFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
  onClose,
}: {
  open: boolean,
  onOpenChange: (val: boolean) => void,
  chatbotId: string,
  folder: Folder | null,
  onClose?: (item: EditFolderSchema) => void,
}) {
  const { t } = useTranslate();

  const {
    form,
    handleSubmitWithAction
  } = useHookFormAction(editFolderAction.bind(null, chatbotId, folder?.id ?? ""), zodResolver(editFolderSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Folder updated successfully`)
        onClose && onClose(form.getValues())

        onOpenChange(false)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      }
    },
    formProps: {
      mode: "onChange",
      defaultValues: {
        name: folder?.name ?? ""
      }
    },
    errorMapProps: {}
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('folders.edit.title')}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('folders.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('folders.name')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-4">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel-btn')}</Button>
                <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  {t('common.confirm-btn')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

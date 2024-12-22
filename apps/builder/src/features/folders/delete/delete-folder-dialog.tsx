"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslate } from '@tolgee/react';
import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { deleteFolderAction } from "@/features/folders/delete/delete-folder-action";
import { deleteFolderSchema } from "@/features/folders/delete/delete-folder-schema";

export function DeleteFolderDialog({ children, chatbotId, folderId }: {
  children: ReactNode,
  chatbotId: string,
  folderId: string
}) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);

  const {
    form,
    handleSubmitWithAction
  } = useHookFormAction(deleteFolderAction.bind(null, chatbotId, folderId), zodResolver(deleteFolderSchema), {
    actionProps: {
      onSuccess: () => {
        toast(`Folder deleted successfully`)
        setOpen(false)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('folders.delete.title')}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <div className="flex justify-end gap-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel-btn')}</Button>
              <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin"/>}
                {t('common.delete')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

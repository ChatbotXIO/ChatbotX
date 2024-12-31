"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createFolderAction } from "@/features/folders/actions/create-folder-action";
import { createFolderSchema } from "@/features/folders/schemas/create-folder-schema";
import { FolderType } from "@ahachat.ai/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { T, useTranslate } from '@tolgee/react';
import { Loader2, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function CreateFolderDialog({ chatbotId, folderType, parentId }: {
  chatbotId: string,
  folderType: FolderType,
  parentId: string | null,
}) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction
  } = useHookFormAction(createFolderAction.bind(null, chatbotId, folderType, parentId), zodResolver(createFolderSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Folder created successfully`)

        setOpen(false)
        router.refresh()
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
        name: "",
      }
    },
    errorMapProps: {}
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="tags.createBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('folders.create.title')}</DialogTitle>
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
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel-btn')}</Button>
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

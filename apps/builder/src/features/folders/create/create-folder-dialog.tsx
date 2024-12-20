"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useTranslate } from '@tolgee/react';
import { useState } from "react";
import { FolderGroup } from "@prisma/client";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { createFolderAction } from "@/features/folders/create/create-folder-action";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createFolderSchema } from "@/features/folders/create/create-folder-schema";

export function CreateFolderDialog({ children, chatbotId, group, parentId }: {
  children: React.ReactNode,
  chatbotId: string,
  group: FolderGroup,
  parentId?: string,
}) {
  const { t } = useTranslate();

  const [open, setOpen] = useState(false);

  const { form, handleSubmitWithAction } = useHookFormAction(createFolderAction, zodResolver(createFolderSchema), {
    actionProps: {
      onSuccess: () => {
        toast(`Folder created successfully`)

        setOpen(false)
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
        chatbotId,
        name: "",
        group,
        parentId
      }
    },
    errorMapProps: {}
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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
                  <FormMessage/>
                </FormItem>
              )}/>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel-btn')}</Button>
                <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="animate-spin"/>}
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

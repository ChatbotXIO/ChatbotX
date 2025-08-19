"use client"

import type { FolderType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { createFolderAction } from "@/features/folders/actions/create-folder-action"
import { createFolderSchema } from "@/features/folders/schemas/create-folder-schema"

export function CreateFolderDialog({
  chatbotId,
  folderType,
  parentId,
}: {
  chatbotId: string
  folderType: FolderType
  parentId: string | null
}) {
  const { t } = useTranslate()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createFolderAction.bind(null, chatbotId),
      zodResolver(createFolderSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("folders.created"))
            resetFormAndAction()
            setOpen(false)
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: "",
            folderType,
            parentId: parentId === "" ? null : parentId,
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="common.createBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("folders.createAction.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("folders.name.label")} name="name" />

              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("common.cancelBtn")}
                </Button>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("common.createBtn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

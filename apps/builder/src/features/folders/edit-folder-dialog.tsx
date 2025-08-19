"use client"

import type { FolderModel } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { editFolderAction } from "@/features/folders/actions/edit-folder-action"
import { editFolderSchema } from "@/features/folders/schemas/edit-folder-schema"

export function EditFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  folder: FolderModel | null
}) {
  const { t } = useTranslate()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      editFolderAction.bind(null, chatbotId, folder?.id ?? ""),
      zodResolver(editFolderSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("folders.editAction.successMessage"))
            resetFormAndAction()
            onOpenChange(false)
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: folder?.name ?? "",
          },
        },
        errorMapProps: {},
      },
    )

  useEffect(() => {
    form.reset({ name: folder?.name })
  }, [folder, form.reset])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("folders.editForm.title")}</DialogTitle>
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
                  onClick={() => onOpenChange(false)}
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
                  {t("common.editBtn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

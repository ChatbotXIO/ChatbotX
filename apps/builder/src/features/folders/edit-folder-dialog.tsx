"use client"

import { InputField } from "@/components/form/input-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { editFolderAction } from "@/features/folders/actions/edit-folder-action"
import { editFolderSchema } from "@/features/folders/schemas/edit-folder-schema"
import type { Folder } from "@ahachat.ai/database/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

export function EditFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  folder: Folder | null
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("folders.editForm.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <InputField name="name" label={t("folders.name.label")} />

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancelBtn")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
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

"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { createWorkspaceAction } from "./actions/create-workspace.action"
import { createWorkspaceRequest } from "./schema/create-workspace"

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations("workspaces")
  const tActions = useTranslations("actions")
  const router = useRouter()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createWorkspaceAction,
      zodResolver(createWorkspaceRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            if (data?.id) {
              toast.success(t("createDialog.success", { name: data.name }))
              resetFormAndAction()
              onOpenChange(false)
              router.push(`/space/${data.id}/dashboard`)
              router.refresh()
            }
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: { name: "" },
        },
      },
    )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("createDialog.nameLabel")}
              name="name"
              placeholder={t("createDialog.namePlaceholder")}
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {tActions("cancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("createDialog.submit")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

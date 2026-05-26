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
import { useEffect } from "react"
import { toast } from "sonner"
import { updateWorkspaceBasicAction } from "./actions/update-workspace-action"
import type { OrgWorkspaceRow } from "./queries/list-org-workspaces"
import { updateWorkspaceBasicRequest } from "./schema/update-workspace-schema"

export function RenameWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: OrgWorkspaceRow | null
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations("manageWorkspaces.renameDialog")
  const tActions = useTranslations("actions")
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateWorkspaceBasicAction.bind(null, workspace?.id ?? ""),
    zodResolver(updateWorkspaceBasicRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("success"))
          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { name: workspace?.name ?? "" },
      },
    },
  )

  useEffect(() => {
    if (workspace) {
      form.reset({ name: workspace.name })
    }
  }, [workspace, form])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("nameLabel")} name="name" required />
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
                {t("submit")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

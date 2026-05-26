"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
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
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { updateWorkspaceMemberAction } from "../actions/update-workspace-member.action"
import { updateWorkspaceMemberRequest } from "../schema/mutation"
import type { WorkspaceMemberResource } from "../schema/resource"
import { AdvancedRestrictions } from "./restrictions-form"

const defaultPermissions = {
  restrictDataExport: false,
  restrictContactDeletion: false,
  restrictWorkspaceSettings: false,
  restrictIntegrationSettings: false,
  contactVisibility: "all" as const,
  restrictCalling: false,
  restrictWorkflows: false,
  maskPhoneAndEmail: false,
}

export function UpdateWorkspaceMemberDialog({
  workspaceMember,
  open,
  onOpenChange,
}: {
  workspaceMember:
    | (WorkspaceMemberResource & { user?: { email?: string } })
    | null
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations("admins")
  const tActions = useTranslations("actions")
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateWorkspaceMemberAction.bind(
      null,
      workspaceMember?.workspaceId ?? "",
      workspaceMember?.id ?? "",
    ),
    zodResolver(updateWorkspaceMemberRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("editDialog.title"))
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
        defaultValues: {
          role:
            (workspaceMember?.role as "owner" | "manager" | "agent") ?? "agent",
          permissions: {
            ...defaultPermissions,
            ...(workspaceMember?.permissions ?? {}),
          },
        },
      },
    },
  )

  useEffect(() => {
    if (workspaceMember) {
      form.reset({
        role: workspaceMember.role as "owner" | "manager" | "agent",
        permissions: {
          ...defaultPermissions,
          ...(workspaceMember.permissions ?? {}),
        },
      })
    }
  }, [workspaceMember, form])

  const role = useWatch({ control: form.control, name: "role" })

  const email = workspaceMember?.user?.email ?? ""

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <div className="grid grid-cols-2 gap-4">
              <InputField
                disabled
                label={t("inviteDialog.emailLabel")}
                name="__email"
                placeholder={email}
              />
              <SelectField
                label={t("inviteDialog.accessLevelLabel")}
                name="role"
                options={[
                  { value: "owner", label: t("roles.owner") },
                  { value: "manager", label: t("roles.manager") },
                  { value: "agent", label: t("roles.agent") },
                ]}
                required
              />
            </div>

            <p className="text-sm text-text-secondary">
              {t(`roleDescriptions.${role}`)}
            </p>

            <AdvancedRestrictions role={role} />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="ghost"
              >
                {tActions("cancel")}
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
                {t("editDialog.submit")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

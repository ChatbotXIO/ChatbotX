"use client"

import { MAX_ADMIN_WORKSPACE_MEMBERS } from "@chatbotx.io/business/admin-workspace/constants"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { WorkspaceMemberPermissionFields } from "@/features/workspace-members/components/workspace-member-permission-fields"
import { getSuperAdminPermissions } from "@/features/workspace-members/helpers"
import { createAdminWorkspaceAction } from "./create-admin-workspace.action"
import { createAdminWorkspaceSchema } from "./schema"

export function CreateAdminWorkspaceDialog() {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAdminWorkspaceAction,
      zodResolver(createAdminWorkspaceSchema),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            if (!data) {
              return
            }
            resetFormAndAction()
            setOpen(false)
            const newAccountCount =
              (data.owner.created ? 1 : 0) +
              data.members.filter((member) => member.created).length
            toast.success(
              t("platformAdmin.workspaces.createdSummary", {
                ownerEmail: data.owner.email,
                memberCount: data.members.length,
                newAccountCount,
              }),
            )
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
            name: "",
            ownerEmail: "",
            memberEmails: [],
            permissions: getSuperAdminPermissions(),
          },
        },
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon aria-hidden="true" className="size-4" />
            {t("platformAdmin.workspaces.createButton")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("platformAdmin.workspaces.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("platformAdmin.workspaces.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-6" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <InputField
              label={t("platformAdmin.workspaces.ownerEmail")}
              name="ownerEmail"
              required
              type="email"
            />
            <TagsInputField
              addAnotherPlaceholder={t("actions.addAnother")}
              description={t("platformAdmin.workspaces.membersHint")}
              label={t("platformAdmin.workspaces.memberEmails")}
              maxTags={MAX_ADMIN_WORKSPACE_MEMBERS}
              name="memberEmails"
              transformTag={(tag) => tag.trim().toLowerCase()}
            />
            <Label>{t("fields.permissions.label")}</Label>
            <div className="flex flex-col gap-4">
              <WorkspaceMemberPermissionFields form={form} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

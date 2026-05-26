"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
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
import type { ListWorkspaceMembersResponse } from "@/features/workspace-members/schema/query"
import { updateInboxTeamAction } from "./actions/update-inbox-team.action"
import { updateInboxTeamRequest } from "./schema/action"
import type { InboxTeamResource } from "./schema/resource"

type InboxTeamWithMembers = InboxTeamResource & {
  description?: string | null
  inboxTeamMembers?: Array<{ userId: unknown }>
}

export function ManageInboxTeamDialog({
  open,
  onOpenChange,
  workspaceId,
  inboxTeam,
  workspaceMembers,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  workspaceId: string
  inboxTeam: InboxTeamWithMembers | null
  workspaceMembers: ListWorkspaceMembersResponse["data"]
}) {
  const t = useTranslations("inboxTeams")
  const tActions = useTranslations("actions")
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { reset },
  } = useHookFormAction(
    updateInboxTeamAction.bind(null, workspaceId, inboxTeam?.id ?? ""),
    zodResolver(updateInboxTeamRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("manageDialog.title"))
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
          name: inboxTeam?.name ?? "",
          description: inboxTeam?.description ?? "",
          userIds:
            inboxTeam?.inboxTeamMembers?.map((m) => String(m.userId)) ?? [],
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (inboxTeam) {
      reset({
        name: inboxTeam.name,
        description: inboxTeam.description ?? "",
        userIds: inboxTeam.inboxTeamMembers?.map((m) => String(m.userId)) ?? [],
      })
    }
  }, [inboxTeam, reset])

  const userOptions = workspaceMembers.map((cm) => ({
    value: cm.user.id,
    label: cm.user.name ?? "",
  }))

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("manageDialog.title")}</DialogTitle>
          <DialogDescription>{t("manageDialog.description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("fields.name")}
              name="name"
              placeholder={t("fields.namePlaceholder")}
              required
            />
            <TextareaField
              label={t("fields.description")}
              name="description"
              placeholder={t("fields.descriptionPlaceholder")}
              rows={3}
            />
            <MultiSelectField
              label={t("fields.members")}
              name="userIds"
              options={userOptions}
              placeholder={t("fields.membersPlaceholder")}
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
                {t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

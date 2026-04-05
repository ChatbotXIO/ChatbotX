"use client"

import type { InboxTeamModel } from "@chatbotx.io/database/types"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
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
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { ListWorkspaceMembersResponse } from "@/features/workspace-members/schema/query"
import { addInboxTeamMemberAction } from "./actions/add-inbox-team-member.action"
import { addInboxTeamMemberRequest } from "./schema/action"

export function AddInboxTeamMemberDialog({
  open,
  onOpenChange,
  workspaceId,
  inboxTeam,
  workspaceMembers,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  workspaceId: string
  inboxTeam: InboxTeamModel | null
  workspaceMembers: ListWorkspaceMembersResponse["data"]
}) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    addInboxTeamMemberAction.bind(null, workspaceId, inboxTeam?.id ?? ""),
    zodResolver(addInboxTeamMemberRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.inboxTeamMember.label"),
            }),
          )
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
          userIds: [],
        },
      },
      errorMapProps: {},
    },
  )

  const userOptions = workspaceMembers.map((cm) => ({
    value: cm.user.id,
    label: cm.user.name ?? "",
  }))

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.addFeature", {
              feature: t("fields.inboxTeamMember.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <MultiSelectField
                label="Select users"
                name="userIds"
                options={userOptions}
              />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">{t("actions.cancel")}</Button>
                </DialogClose>

                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

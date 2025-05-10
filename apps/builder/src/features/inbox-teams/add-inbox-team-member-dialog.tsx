"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { UserResource } from "../users/schemas/types"
import { addInboxTeamMemberAction } from "./actions/add-inbox-team-member.action"
import { addInboxTeamMemberRequest } from "./schemas/add-inbox-team-member.request"
import { MultiSelectField } from "@/components/form/select-field"
import type { InboxTeam } from "@ahachat.ai/database/types"

export function AddInboxTeamMemberDialog({
  open,
  onOpenChange,
  chatbotId,
  inboxTeam,
  listUsers,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  inboxTeam: InboxTeam | null
  listUsers: UserResource[]
}) {
  const { form, handleSubmitWithAction } = useHookFormAction(
    addInboxTeamMemberAction.bind(null, chatbotId, inboxTeam?.id ?? ""),
    zodResolver(addInboxTeamMemberRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Member created successfully")
          onOpenChange(false)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
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

  const userOptions = listUsers.map((user) => ({
    value: user.id,
    label: user.name ?? "",
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="inboxTeams.addInboxTeamMemberAction.heading" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <MultiSelectField
                name="userIds"
                label="Select users"
                options={userOptions}
              />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">
                    <T keyName="common.cancelBtn" />
                  </Button>
                </DialogClose>

                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  <T keyName="common.confirm-btn" />
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import type { InboxTeamModel } from "@aha.chat/database/types"
import { MultiSelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { UserResource } from "../users/schemas"
import { addInboxTeamMemberAction } from "./actions/add-inbox-team-member.action"
import { addInboxTeamMemberRequest } from "./schemas/add-inbox-team-member.request"

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
  inboxTeam: InboxTeamModel | null
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
    <Dialog onOpenChange={onOpenChange} open={open}>
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
                  <Button variant="outline">
                    <T keyName="common.cancelBtn" />
                  </Button>
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

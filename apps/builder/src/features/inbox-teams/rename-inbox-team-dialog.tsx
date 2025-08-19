"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useEffect } from "react"
import "react-day-picker/style.css"
import { toast } from "sonner"
import { updateInboxTeamAction } from "./actions/update-inbox-team.action"
import type { InboxTeamResource } from "./schemas/types"
import { updateInboxTeamRequest } from "./schemas/update-inbox-team.request"

export function RenameInboxTeamDialog({
  open,
  onOpenChange,
  chatbotId,
  inboxTeam,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  inboxTeam: InboxTeamResource | null
}) {
  const {
    form,
    handleSubmitWithAction,
    form: { reset },
  } = useHookFormAction(
    updateInboxTeamAction.bind(null, chatbotId, inboxTeam?.id ?? ""),
    zodResolver(updateInboxTeamRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Team update successfully")

          onOpenChange(false)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: inboxTeam?.name || "",
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (inboxTeam) {
      reset({
        name: inboxTeam.name,
      })
    }
  }, [inboxTeam, reset])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="inboxTeam.updateAction.heading" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label="Name" name="name" />

              <DialogFooter className="sm:justify-start">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
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
                  <T keyName="common.updateBtn" />
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

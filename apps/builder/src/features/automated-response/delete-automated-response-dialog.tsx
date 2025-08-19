"use client"

import type { AutomatedResponseModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import type { Row } from "@tanstack/react-table"
import { T } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteAutomatedResponseAction } from "./actions/delete-automated-response-action"

type DeleteAutomatedResponsesDialogProps = ComponentPropsWithoutRef<
  typeof Dialog
> & {
  chatbotId: string
  automatedResponses: Row<AutomatedResponseModel>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteAutomatedResponsesDialog({
  chatbotId,
  automatedResponses,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteAutomatedResponsesDialogProps) {
  const { execute, isPending } = useAction(
    deleteAutomatedResponseAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(<T keyName="automatedResponses.deleted" />)
        onOpenChange(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            <T keyName="common.deleteBtn" /> ({automatedResponses.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="automatedResponses.deleteAction.title" />
          </DialogTitle>
          <DialogDescription>
            <T keyName="automatedResponses.deleteAction.description" />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button onClick={() => onOpenChange(false)} variant="outline">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() =>
              execute({ ids: automatedResponses.map((f) => f.id) })
            }
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            <T keyName="common.deleteBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

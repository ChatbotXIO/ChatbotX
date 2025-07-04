"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { AutomatedResponseModel } from "@ahachat.ai/database/types"
import type { Row } from "@tanstack/react-table"
import { T } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteAutomatedResponseAction } from "./actions/delete-automated-response-action"

interface DeleteAutomatedResponsesDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
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
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={() =>
              execute({ ids: automatedResponses.map((f) => f.id) })
            }
            disabled={isPending}
          >
            {isPending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            <T keyName="common.deleteBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

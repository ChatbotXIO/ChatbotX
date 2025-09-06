"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteWebchatAction } from "../actions/delete-webchat.action"
import type { WebchatWithDetails } from "../queries/get-webchats.query"

type DeleteWebchatDialogProps = {
  chatbotId: string
  webchats: WebchatWithDetails[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DeleteWebchatDialog({
  chatbotId,
  webchats,
  open,
  onOpenChange,
  onSuccess,
}: DeleteWebchatDialogProps) {
  const router = useRouter()

  const { execute, isExecuting } = useAction(deleteWebchatAction, {
    onSuccess: () => {
      toast.success("Webchat deleted successfully!")
      onOpenChange(false)
      onSuccess?.()
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError || "Failed to delete webchat")
    },
  })

  const handleDelete = () => {
    if (webchats.length === 1) {
      execute({ id: webchats[0].id }, { chatbotId })
    } else {
      // Handle multiple deletions
      for (const webchat of webchats) {
        execute({ id: webchat.id }, { chatbotId })
      }
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Webchat</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            {webchats.length === 1 ? (
              <span className="font-semibold">{webchats[0].name}</span>
            ) : (
              `${webchats.length} webchats`
            )}
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            disabled={isExecuting}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isExecuting}
            onClick={handleDelete}
            variant="destructive"
          >
            {isExecuting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

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
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { deleteContactAction } from "../actions/delete-contact.action"

type DeleteContactDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function DeleteContactDialog({
  trigger,
  ids,
}: DeleteContactDialogProps) {
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { execute, isPending, isExecuting } = useAction(
    deleteContactAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(<T keyName="common.updateForm.successMessage" />)
        setOpen(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div>Are you sure to delete those contacts?</div>
        <div>This action can not be reverted.</div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>

          <Button
            disabled={isPending}
            onClick={() => execute({ ids })}
            type="button"
            variant="destructive"
          >
            {isExecuting && <Loader2Icon className="animate-spin" />}
            <T keyName={"common.saveBtn"} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

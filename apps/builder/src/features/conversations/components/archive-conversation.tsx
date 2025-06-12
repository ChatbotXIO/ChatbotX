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
import { useParams } from "next/navigation"
import { useState, type ReactElement } from "react"
import { toast } from "sonner"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { archiveConversationAction } from "../actions/archive-conversation.action"

interface ArchiveConversationDialogProps {
  trigger: ReactElement
  ids: string[]
}

export default function ArchiveConversationDialog({
  trigger,
  ids,
}: ArchiveConversationDialogProps) {
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { execute, isPending } = useAction(
    archiveConversationAction.bind(null, chatbotId),
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Disable Bot</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div>Are you sure to archive those conversations?</div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>

          <Button disabled={isPending} onClick={() => execute({ ids })}>
            {isPending && <Loader2Icon className="animate-spin" />}
            <T keyName={"common.saveBtn"} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

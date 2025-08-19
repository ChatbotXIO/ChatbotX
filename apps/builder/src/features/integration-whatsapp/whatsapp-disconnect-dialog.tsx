"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@aha.chat/ui/components/ui/alert-dialog"
import { Button } from "@aha.chat/ui/components/ui/button"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { disconnectWhatsappAction } from "./actions/disconnect.action"

export function WhatsappDisconnectDialog({ chatbotId }: { chatbotId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectWhatsappAction.bind(null, chatbotId), {
      onSuccess: () => {
        router.refresh()
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    })

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <T keyName="Integration.DisconnectBtn" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T keyName="Integration.DisconnectDialog.Confirm" />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T keyName="Integration.DisconnectDialog.Description" />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <T keyName="Integration.CancelBtn" />
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPendingDisconnect}
            onClick={async (e) => {
              e.preventDefault()
              await onDisconnect()
            }}
          >
            {isPendingDisconnect && <Loader2Icon className="animate-spin" />}
            <T keyName="Integration.DisconnectBtn" />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

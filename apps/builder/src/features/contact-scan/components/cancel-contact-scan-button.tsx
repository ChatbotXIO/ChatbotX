"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { cancelContactScanAction } from "../actions/cancel-contact-scan.action"

type CancelContactScanButtonProps = {
  workspaceId: string
  inboxId: string
}

/**
 * Cancel for the running scan of one inbox, behind a confirmation. Cancelling is
 * idempotent server-side (`cancelled: false` when nothing was running), so a
 * double click or a scan that just finished is reported, not an error.
 */
export function CancelContactScanButton({
  workspaceId,
  inboxId,
}: CancelContactScanButtonProps) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { execute, isPending } = useAction(
    cancelContactScanAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        setOpen(false)
        if (data?.cancelled) {
          toast.success(t("contactScan.cancel.success"))
        } else {
          toast.info(t("contactScan.cancel.notRunning"))
        }
        queryClient.invalidateQueries({
          queryKey:
            orpc.contactScanAPIs.getContactScanStatusAuthenticatedAPI.key({
              input: { workspaceId, inboxId },
            }),
        })
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("contactScan.cancel.failed"))
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            {t("contactScan.cancel.button")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("contactScan.cancel.title")}</DialogTitle>
          <DialogDescription>
            {t("contactScan.cancel.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                {t("contactScan.cancel.keep")}
              </Button>
            }
          />
          <Button
            disabled={isPending}
            onClick={() => execute({ inboxId })}
            type="button"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("contactScan.cancel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

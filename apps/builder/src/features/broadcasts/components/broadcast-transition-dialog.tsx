"use client"

import type { BroadcastModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

export interface BroadcastTransitionDialogConfig {
  confirmLabelKey: string
  descriptionKey: string
  destructive?: boolean
  titleKey: string
}

/**
 * The onSuccess/onError handlers every broadcast transition dialog
 * (move-to-draft, stop, resume) wires into its `useAction` call. Kept as a
 * hook — rather than folded into `BroadcastTransitionDialog` itself —
 * because each caller's action has its own next-safe-action generic
 * signature, so the `useAction` call must stay in the wrapper for the
 * types to infer correctly.
 */
export function useBroadcastTransitionActionCallbacks({
  onOpenChange,
  onSuccess,
}: {
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}): {
  onSuccess: () => void
  onError: (args: { error: { serverError?: string } }) => void
} {
  const t = useTranslations()
  const router = useRouter()

  return {
    onSuccess: () => {
      toast.success(
        t("messages.updatedSuccess", {
          feature: t("fields.broadcast.label"),
        }),
      )
      onOpenChange(false)
      router.refresh()
      onSuccess?.()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
      // The broadcast may have already transitioned out of the state this
      // dialog assumes (e.g. changed from another tab) — refresh so the
      // stale row self-corrects.
      router.refresh()
    },
  }
}

export function BroadcastTransitionDialog({
  broadcast,
  open,
  onOpenChange,
  execute,
  isPending,
  config,
}: {
  broadcast: BroadcastModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  execute: () => void
  isPending: boolean
  config: BroadcastTransitionDialogConfig
}) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(config.titleKey)}</DialogTitle>
          <DialogDescription>
            {t(config.descriptionKey, { name: broadcast?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            disabled={isPending}
            onClick={() => execute()}
            variant={config.destructive ? "destructive" : undefined}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t(config.confirmLabelKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteMiniAppsAction } from "./actions/delete-mini-apps.action"

type DeleteMiniAppsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  miniApps: { id: string }[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (open: boolean) => void
}

export function DeleteMiniAppsDialog({
  workspaceId,
  miniApps,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteMiniAppsDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const feature = t("miniApps.feature")
  const { execute, isPending } = useAction(
    deleteMiniAppsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature }))
        onOpenChange?.(false)
        onSuccess?.()
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline">
              <Trash aria-hidden="true" className="me-2 size-4" />
              {t("actions.delete")} ({miniApps.length})
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("messages.deleteFeature", { feature })}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", { feature })}
            {"\n"}
            {t("miniApps.deleteKeepsWhatsapp")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose
            render={
              <Button
                onClick={() => onOpenChange?.(false)}
                size="sm"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            disabled={isPending}
            onClick={() =>
              execute({ ids: miniApps.map((miniApp) => miniApp.id) })
            }
            size="sm"
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="me-2 size-4 animate-spin" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

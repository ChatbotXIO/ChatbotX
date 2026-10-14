"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { CopyPlusIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { duplicateMiniAppAction } from "../actions/duplicate-mini-app.action"
import { miniAppEditPath } from "../lib/routes"

type DuplicateMiniAppDialogProps = {
  workspaceId: string
  miniAppId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DuplicateMiniAppDialog({
  workspaceId,
  miniAppId,
  open,
  onOpenChange,
}: DuplicateMiniAppDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const feature = t("miniApps.feature")
  const { execute, isPending } = useAction(
    duplicateMiniAppAction.bind(null, workspaceId, miniAppId ?? ""),
    {
      onSuccess: ({ data }) => {
        toast.success(t("messages.duplicatedSuccess", { feature }))
        onOpenChange(false)
        if (data?.id) {
          router.push(miniAppEditPath(workspaceId, data.id))
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.duplicateFeature", { feature })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.duplicateConfirmation", { feature })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button disabled={isPending || !miniAppId} onClick={() => execute()}>
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CopyPlusIcon className="size-4" />
            )}
            {t("actions.duplicate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

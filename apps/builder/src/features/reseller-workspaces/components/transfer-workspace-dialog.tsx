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
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { transferWorkspaceToOwnerAction } from "../actions/transfer-workspace-to-owner.action"

export type TransferWorkspaceTarget = {
  id: string
  name: string
  ownerEmail: string
}

type TransferWorkspaceDialogProps = {
  target: TransferWorkspaceTarget | null
  onOpenChange: (open: boolean) => void
}

export function TransferWorkspaceDialog({
  target,
  onOpenChange,
}: TransferWorkspaceDialogProps) {
  const t = useTranslations("resellerWorkspaces")

  const { execute, isPending } = useAction(transferWorkspaceToOwnerAction, {
    onSuccess: () => {
      toast.success(t("success"))
      onOpenChange(false)
      // A full reload, not `router.refresh()`: the workspace now belongs to a
      // different tenant, so the sidebar and workspace switcher must re-resolve.
      window.location.reload()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t("error"))
    },
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={target !== null}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("dialogTitle", { name: target?.name ?? "" })}
          </DialogTitle>
          <DialogDescription className="text-sm/6">
            {t("dialogIntro", { email: target?.ownerEmail ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-2 pl-5 text-sm/6">
          <li>{t("warnAccess")}</li>
          <li>{t("warnPlatform")}</li>
          <li>{t("warnTemplates")}</li>
        </ul>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={isPending || target === null}
            onClick={() => target && execute({ workspaceId: target.id })}
            size="sm"
            type="button"
          >
            {isPending && <Loader2 className="animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { duplicateMinigameAction } from "../actions/duplicate-minigame.action"

type DuplicateMinigameDialogProps = {
  workspaceId: string
  minigameId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DuplicateMinigameDialog({
  workspaceId,
  minigameId,
  open,
  onOpenChange,
}: DuplicateMinigameDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    duplicateMinigameAction.bind(null, workspaceId, minigameId ?? ""),
    {
      onSuccess: ({ data }) => {
        toast.success(t("minigames.duplicateDialog.success"))
        onOpenChange(false)
        if (data?.id) {
          router.push(`/space/${workspaceId}/minigames/${data.id}/edit`)
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
          <DialogTitle>{t("minigames.duplicateDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("minigames.duplicateDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button disabled={isPending || !minigameId} onClick={() => execute()}>
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

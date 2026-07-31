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
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import type {
  CommentAutomationRow,
  CommentAutomationTranslationNamespace,
} from "./types"

export function DeleteCommentAutomationDialog({
  resource,
  open,
  onOpenChange,
  onSuccess,
  translationNamespace,
  action,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  resource: Pick<CommentAutomationRow, "id" | "workspaceId"> | null
  translationNamespace: CommentAutomationTranslationNamespace
  // A bound next-safe-action action (`someAction.bind(null, workspaceId, id)`).
  // Called directly rather than through `useAction` — the two callers pass
  // differently-shaped bound actions (fb vs ig), and hand-typing a generic
  // that satisfies `useAction`'s SafeActionFn constraint for both is more
  // fragile than just calling the action and reading its result.
  action: () => Promise<{ serverError?: string } | undefined>
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const [isPending, setIsPending] = useState(false)

  const handleDelete = async () => {
    setIsPending(true)
    const result = await action()
    setIsPending(false)

    if (result?.serverError) {
      toast.error(result.serverError)
      return
    }

    toast.success(
      t("messages.deletedSuccess", {
        feature: t(`${translationNamespace}.title`),
      }),
    )
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t(`${translationNamespace}.title`),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t(`${translationNamespace}.title`),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            className="ms-auto"
            disabled={isPending || !resource}
            onClick={handleDelete}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

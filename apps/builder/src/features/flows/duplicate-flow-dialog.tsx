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
import { CopyPlus, Loader } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { duplicateFlowAction } from "./actions/duplicate-flow.action"
import type { FlowResource } from "./schemas/resource"

type DuplicateFlowDialogProps = {
  workspaceId: string
  flow: FlowResource | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess?: (flowId: string) => void
}

export function DuplicateFlowDialog({
  workspaceId,
  flow,
  open,
  onOpenChange,
  onSuccess,
}: DuplicateFlowDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    duplicateFlowAction.bind(null, workspaceId, flow?.id ?? ""),
    {
      onSuccess: ({ data: duplicatedFlowId }) => {
        toast.success(
          t("messages.duplicatedSuccess", {
            feature: t("fields.flow.label"),
          }),
        )
        onOpenChange(false)
        if (duplicatedFlowId) {
          onSuccess?.(duplicatedFlowId)
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
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.duplicateFeature", {
              feature: t("fields.flow.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.duplicateConfirmation", {
              feature: t("fields.flow.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose
            render={
              <Button size="sm" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            disabled={isPending || !flow}
            onClick={() => execute()}
            size="sm"
            variant="default"
          >
            {isPending ? (
              <Loader aria-hidden="true" className="me-2 size-4 animate-spin" />
            ) : (
              <CopyPlus aria-hidden="true" className="me-2 size-4" />
            )}
            {t("actions.duplicate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

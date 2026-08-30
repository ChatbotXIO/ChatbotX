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
import type { Row } from "@tanstack/react-table"
import { Loader, RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { resetBotFieldsAction } from "./actions/reset-bot-field.action"
import type { BotFieldResource } from "./schema/resource"

type ResetBotFieldsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  records: Row<BotFieldResource>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function ResetBotFieldsDialog({
  workspaceId,
  records,
  showTrigger = true,
  onOpenChange,
  onSuccess,
  ...props
}: ResetBotFieldsDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    resetBotFieldsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.resetSuccess", {
            feature: t("fields.botField.label"),
          }),
        )
        onOpenChange?.(false)
        onSuccess?.()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog {...props} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline">
              <RotateCcw aria-hidden="true" className="me-2 size-4" />
              {t("actions.reset")} ({records.length})
            </Button>
          }
        />
      ) : null}
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.resetFeature", {
              feature: t("fields.botField.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.resetConfirmation", {
              feature: t("fields.botField.label"),
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
            aria-label={t("actions.reset")}
            disabled={isPending}
            onClick={() => execute({ ids: records.map((f) => f.id) })}
            size="sm"
          >
            {isPending && (
              <Loader aria-hidden="true" className="me-2 size-4 animate-spin" />
            )}
            {t("actions.reset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

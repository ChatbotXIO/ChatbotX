"use client"

import type { FlowModel } from "@chatbotx.io/database/types"
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
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { duplicateFlowAction } from "../../actions/duplicate-flow.action"

type DuplicateFlowDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  flow: FlowModel | null
}

export function DuplicateFlowDialog({
  flow,
  open,
  onOpenChange,
}: DuplicateFlowDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    duplicateFlowAction.bind(null, flow?.workspaceId ?? "", flow?.id ?? ""),
    {
      onSuccess: () => {
        toast.success(
          t("messages.duplicateSuccess", {
            feature: t("fields.flow.label"),
          }),
        )

        onOpenChange(false)
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-md overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.duplicateTitle", { feature: t("fields.flow.label") })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">
            {t("messages.duplicateDescription", {
              feature: t("fields.flow.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button disabled={isPending} onClick={() => execute()} size="sm">
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

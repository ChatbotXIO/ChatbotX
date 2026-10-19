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
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteWorkingHoursAction } from "../actions/delete-working-hours.action"
import type { WorkingHoursResource } from "../schema/resource"

export function DeleteWorkingHoursDialog({
  open,
  onOpenChange,
  workspaceId,
  workingHours,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workingHours: WorkingHoursResource | null
}) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteWorkingHoursAction.bind(null, workspaceId, workingHours?.id ?? ""),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", { feature: t("workingHours.label") }),
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
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", { feature: t("workingHours.label") })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("workingHours.deleteDescription", {
              name: workingHours?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !workingHours}
            onClick={() => execute()}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { useMutation } from "@tanstack/react-query"
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { useInvalidatePolls } from "../lib/use-invalidate-polls"

type DeletePollsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  polls: { id: string }[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeletePollsDialog({
  workspaceId,
  polls,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeletePollsDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const invalidatePolls = useInvalidatePolls()

  const { mutate, isPending } = useMutation(
    orpc.pollsAPI.bulkDeletePollsAPI.mutationOptions({
      onSuccess: async () => {
        toast.success(
          t("messages.deletedSuccess", { feature: t("pollManager.feature") }),
        )
        await invalidatePolls()
        onOpenChange?.(false)
        onSuccess?.()
        router.refresh()
      },
      onError: (error) => {
        toast.error(error.message)
      },
    }),
  )

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline">
              <Trash aria-hidden="true" className="me-2 size-4" />
              {t("actions.delete")} ({polls.length})
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", { feature: t("pollManager.feature") })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("pollManager.deleteDescription")}
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
              mutate({ workspaceId, ids: polls.map((poll) => poll.id) })
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

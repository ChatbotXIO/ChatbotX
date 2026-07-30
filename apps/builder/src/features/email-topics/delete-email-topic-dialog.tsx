"use client"

import type { EmailTopicModel } from "@chatbotx.io/database/types"
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
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteEmailTopicAction } from "./actions/delete-email-topic-action"

type DeleteEmailTopicsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  emailTopics: Row<EmailTopicModel>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeleteEmailTopicsDialog({
  workspaceId,
  emailTopics,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteEmailTopicsDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteEmailTopicAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.emailTopic.label"),
          }),
        )
        onSuccess?.()
        onOpenChange?.(false)
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
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline">
              <Trash aria-hidden="true" className="me-2 size-4" />
              {t("actions.delete")} ({emailTopics.length})
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.emailTopic.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("fields.emailTopic.label"),
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
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() =>
              execute({ ids: emailTopics.map((topic) => topic.id) })
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

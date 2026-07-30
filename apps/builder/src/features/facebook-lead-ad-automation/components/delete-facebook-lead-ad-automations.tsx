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
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteFacebookLeadAdAutomationsAction } from "../actions/delete-facebook-lead-ad-automations.action"
import type { FacebookLeadAdsAutomationResource } from "../schemas/resource"

type DeleteDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  automations: FacebookLeadAdsAutomationResource[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeleteFacebookLeadAdAutomationsDialog({
  workspaceId,
  automations,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteFacebookLeadAdAutomationsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("facebookLeadAdsAutomation.title"),
          }),
        )
        onOpenChange?.(false)
        onSuccess?.()
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
              {t("actions.delete")} ({automations.length})
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("facebookLeadAdsAutomation.title"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("facebookLeadAdsAutomation.title"),
            })}
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
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() => execute({ ids: automations.map((f) => f.id) })}
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

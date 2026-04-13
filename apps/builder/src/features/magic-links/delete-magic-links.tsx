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
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteMagicLinksAction } from "./actions/delete-magic-links.action"
import type { MagicLinkResource } from "./schemas/resource"

type DeleteMagicLinksDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  magicLinks: Row<MagicLinkResource>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export const DeleteMagicLinksDialog = ({
  workspaceId,
  magicLinks,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteMagicLinksDialogProps) => {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteMagicLinksAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("magicLinks.title"),
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
        <DialogTrigger asChild>
          <Button size="sm" type="button" variant="outline">
            <Trash aria-hidden className="mr-2 size-4" />
            {t("actions.delete")} ({magicLinks.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("magicLinks.title"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("magicLinks.title"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button
              onClick={() => onOpenChange?.(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() => execute({ ids: magicLinks.map((f) => f.id) })}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden className="mr-2 size-4 animate-spin" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

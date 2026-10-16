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
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteDecisionProfilesAction } from "../actions/delete-decision-profiles.action"
import { useInvalidateDecisionProfiles } from "../hooks/use-decision-profiles"
import type { DecisionProfileListItem } from "../schema/resource"

type Props = {
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  open: boolean
  profiles: DecisionProfileListItem[]
  workspaceId: string
}

export function DeleteDecisionProfilesDialog({
  onOpenChange,
  onSuccess,
  open,
  profiles,
  workspaceId,
}: Props) {
  const router = useRouter()
  const invalidateDecisionProfiles = useInvalidateDecisionProfiles()
  const t = useTranslations()
  const { execute, isPending } = useAction(
    deleteDecisionProfilesAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
      onSuccess: () => {
        invalidateDecisionProfiles()
        toast.success(
          t("messages.deletedSuccess", { feature: t("decision.profile") }),
        )
        onOpenChange(false)
        onSuccess?.()
        router.refresh()
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", { feature: t("decision.profile") })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("decision.profile"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || profiles.length === 0}
            onClick={() =>
              execute({ ids: profiles.map((profile) => profile.id) })
            }
            variant="destructive"
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <Trash2Icon className="size-4" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

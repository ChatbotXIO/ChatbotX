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
import { authClient } from "@/lib/auth/auth-client"
import { deleteWorkspaceMemberAction } from "../actions/delete-workspace-member.action"
import type { WorkspaceMemberResource } from "../schema/resource"

export function DeleteWorkspaceMemberDialog({
  workspaceMember,
  open,
  onOpenChange,
}: {
  workspaceMember?: WorkspaceMemberResource
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const { data: session } = authClient.useSession()

  const { execute, isPending } = useAction(
    deleteWorkspaceMemberAction.bind(
      null,
      workspaceMember?.workspaceId ?? "",
      workspaceMember?.id ?? "",
    ),
    {
      onSuccess: () => {
        onOpenChange(false)
        if (workspaceMember?.userId === session?.user?.id) {
          router.push("/")
        } else {
          router.refresh()
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.workspaceMember.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("fields.workspaceMember.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute()}
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

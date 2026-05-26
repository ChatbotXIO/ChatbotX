"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { deleteWorkspaceAction } from "./actions/delete-workspace.action"
import type { OrgWorkspaceRow } from "./queries/list-org-workspaces"

export function DeleteWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: OrgWorkspaceRow | null
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations("manageWorkspaces.deleteDialog")
  const tActions = useTranslations("actions")
  const router = useRouter()
  const [confirm, setConfirm] = useState("")

  const { execute, isPending } = useAction(deleteWorkspaceAction, {
    onSuccess: () => {
      toast.success(t("success"))
      setConfirm("")
      onOpenChange(false)
      router.refresh()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  useEffect(() => {
    if (!open) {
      setConfirm("")
    }
  }, [open])

  const canDelete =
    workspace && confirm.trim().toLowerCase() === workspace.name.toLowerCase()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: workspace?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>{t("confirmLabel", { name: workspace?.name ?? "" })}</Label>
          <Input
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={workspace?.name ?? ""}
            value={confirm}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {tActions("cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={!canDelete || isPending}
            onClick={() =>
              workspace && execute({ id: workspace.id, confirmName: confirm })
            }
            type="button"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

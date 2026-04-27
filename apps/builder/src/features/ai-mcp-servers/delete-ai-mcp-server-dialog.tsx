"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useTransition } from "react"
import { toast } from "sonner"
import { deleteAIMcpServerAction } from "./actions/delete-ai-mcp-server.action"
import type { AIMcpServerResource } from "./schema/resource"

type DeleteAIMcpServerDialogProps = {
  workspaceId: string
  mcpServer: AIMcpServerResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export const DeleteAIMcpServerDialog = ({
  workspaceId,
  mcpServer,
  open,
  onOpenChange,
  onSuccess,
}: DeleteAIMcpServerDialogProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!mcpServer) {
      return
    }

    startTransition(async () => {
      const result = await deleteAIMcpServerAction(workspaceId, mcpServer.id)
      if (result?.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.mcpServer.label"),
          }),
        )
        onOpenChange(false)
        onSuccess?.()
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.mcpServer.label"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("fields.mcpServer.label"),
              name: mcpServer?.name ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleDelete}>
            {isPending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            {t("actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { format } from "date-fns"
import { Loader2Icon, StarIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import type { FlowResource } from "@/features/flows/schema/resource"
import { client } from "@/lib/orpc/orpc"
import { restoreFlowVersionAction } from "../../actions/restore-flow-version-action"

type FlowVersionsDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  flow: FlowResource
  workspaceId: string
  onRestoreSuccess: (nodes: unknown[], edges: unknown[]) => void
}

export function FlowVersionsDialog({
  open,
  onOpenChange,
  flow,
  workspaceId,
  onRestoreSuccess,
}: FlowVersionsDialogProps) {
  const t = useTranslations()
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const {
    data: versions = [],
    isLoading,
    mutate,
  } = useSWR(
    open ? (["flow-versions", workspaceId, flow.id] as const) : null,
    ([, ws, id]) =>
      client.flowsAPI.privateListFlowVersionsAPI({
        workspaceId: ws,
        flowId: id,
      }),
  )

  const { execute: restoreVersion } = useAction(
    restoreFlowVersionAction.bind(null, workspaceId, flow.id),
    {
      onSuccess: ({ data }) => {
        toast.success(t("messages.restoreVersionSuccess"))
        mutate()
        onOpenChange(false)
        setRestoringId(null)
        if (data) {
          onRestoreSuccess(data.nodes, data.edges)
        }
      },
      onError: ({ error }) => {
        setRestoringId(null)
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("actions.flowVersions")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="animate-spin" />
          </div>
        )}

        {!isLoading && versions.length === 0 && (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {t("messages.noVersionsFound")}
          </p>
        )}

        {!isLoading && versions.length > 0 && (
          <ul className="divide-y">
            {versions.map((version) => (
              <li
                className="flex items-center justify-between gap-4 py-3"
                key={version.id}
              >
                <span className="flex items-center gap-1.5 font-medium text-sm">
                  {format(version.createdAt, "yyyy/MM/dd HH:mm")}
                  {version.isLatest && (
                    <StarIcon className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    disabled={version.isLatest || restoringId !== null}
                    onClick={() => {
                      setRestoringId(version.id)
                      restoreVersion({ versionId: version.id })
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {restoringId === version.id && (
                      <Loader2Icon className="animate-spin" />
                    )}
                    {t("actions.restore")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

"use client"

import type { FlowModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { type Edge, MarkerType, type Node, useReactFlow } from "@xyflow/react"
import {
  ChartNoAxesCombinedIcon,
  CopyIcon,
  EllipsisIcon,
  HistoryIcon,
  LinkIcon,
  Loader2Icon,
  RefreshCcwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { GetInboxUrlDialog } from "@/features/inboxes/components/get-inbox-url"
import { publishFlowAction } from "../actions/publish-flow-action"
import { DeleteFlowsDialog } from "../delete-flow-dialog"
import {
  type PublishFlowSchema,
  updateFlowVersionSchema,
} from "../schemas/action"
import AnalyticsFlow from "./components/analytics-flow"
import { DuplicateFlowDialog } from "./components/duplicate-flow"
import { FlowVersionsDialog } from "./components/flow-versions-dialog"
import { RenameFlowDialog } from "./components/rename-flow"

export function FlowEditToolbar({
  workspaceId,
  flow,
}: {
  workspaceId: string
  flow: FlowModel
}) {
  const t = useTranslations()
  const router = useRouter()

  const [isValidating, setIsValidating] = useState<boolean>(false)
  const [action, setAction] = useState<
    | "publish"
    | "rename"
    | "duplicate"
    | "getDraftLink"
    | "getPublishedLink"
    | "analytics"
    | "flowVersions"
    | "delete"
    | "revertToPublished"
    | null
  >(null)

  // NOTES: DO NOT use useNodes & useEdges, it makes component re-render when node or edge is changed
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow()

  const { execute: executePublish, isPending: isPendingPublish } = useAction(
    publishFlowAction.bind(null, workspaceId, flow.id),
    {
      onSuccess: () => {
        toast.success(t("messages.publishVersionSuccess"))
      },
    },
  )

  const onClickPublish = () => {
    setIsValidating(true)

    // validate nodes & edges
    const nodes = getNodes()
    const edges = getEdges()
    const { success } = updateFlowVersionSchema.safeParse({
      nodes,
      edges,
    })

    if (success) {
      executePublish({
        nodes: nodes as unknown as PublishFlowSchema["nodes"],
        edges: edges as unknown as PublishFlowSchema["edges"],
      })
    } else {
      toast.error(t("messages.flowConfigIncomplete"))
    }
    setIsValidating(false)
  }

  return (
    <div className="flex gap-2">
      <Button className="px-1.5" size="sm" variant="ghost">
        <RotateCcwIcon />
      </Button>
      <Button className="px-1.5" size="sm" variant="ghost">
        <RotateCwIcon />
      </Button>
      <Button
        className="ml-5"
        disabled={isValidating || isPendingPublish}
        onClick={onClickPublish}
        size="sm"
        variant="default"
      >
        {(isValidating || isPendingPublish) && (
          <Loader2Icon className="animate-spin" />
        )}
        {t("actions.publish")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-1.5">
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setAction("rename")}>
              <TypeIcon />
              {t("actions.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAction("duplicate")}>
              <CopyIcon />
              {t("actions.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAction("getDraftLink")}>
              <LinkIcon />
              {t("actions.getDraftLink")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAction("getPublishedLink")}>
              <LinkIcon />
              {t("actions.getPublishedLink")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() =>
                router.push(
                  `/space/${flow.workspaceId}/flows/${flow.id}/analytics`,
                )
              }
            >
              <ChartNoAxesCombinedIcon />
              {t("actions.analytics")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAction("flowVersions")}>
              <HistoryIcon />
              {t("actions.flowVersions")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <RefreshCcwIcon />
              {t("actions.revertToPublished")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setAction("delete")}
              variant="destructive"
            >
              <Trash2Icon />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameFlowDialog
        flow={flow}
        onOpenChange={() => setAction(null)}
        open={action === "rename"}
      />

      <DuplicateFlowDialog
        flow={flow}
        onOpenChange={() => setAction(null)}
        open={action === "duplicate"}
      />

      <DeleteFlowsDialog
        flows={[flow]}
        onOpenChange={() => setAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={action === "delete"}
        showTrigger={false}
        workspaceId={workspaceId}
      />

      <GetInboxUrlDialog
        onOpenChange={() => setAction(null)}
        open={action === "getDraftLink"}
        refConfig={{ type: "draft", flowId: flow.id }}
      />

      <GetInboxUrlDialog
        onOpenChange={() => setAction(null)}
        open={action === "getPublishedLink"}
        refConfig={{
          type: "flow",
          flowId: flow.id,
        }}
      />

      <FlowVersionsDialog
        flow={flow}
        onOpenChange={() => setAction(null)}
        onRestoreSuccess={(nodes, edges) => {
          setNodes(nodes as Node[])
          setEdges(
            (edges as Edge[]).map((edge) => ({
              ...edge,
              type: "buttonedge",
              markerEnd: { type: MarkerType.ArrowClosed },
            })),
          )
        }}
        open={action === "flowVersions"}
        workspaceId={workspaceId}
      />

      {action === "analytics" && <AnalyticsFlow flow={flow} />}
    </div>
  )
}

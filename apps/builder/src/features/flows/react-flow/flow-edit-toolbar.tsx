"use client"

import type { FlowModel } from "@chatbotx.io/database/types"
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
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { type Edge, MarkerType, type Node, useReactFlow } from "@xyflow/react"
import {
  ChartNoAxesCombinedIcon,
  CopyIcon,
  EllipsisIcon,
  HistoryIcon,
  LinkIcon,
  Loader2Icon,
  MegaphoneIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { GetInboxUrlDialog } from "@/features/inboxes/components/get-inbox-url"
import { publishFlowAction } from "../actions/publish-flow-action"
import { revertToPublishedAction } from "../actions/revert-to-published-action"
import { DeleteFlowsDialog } from "../delete-flow-dialog"
import { DuplicateFlowDialog } from "../duplicate-flow-dialog"
import {
  type PublishFlowSchema,
  updateFlowVersionSchema,
} from "../schemas/action"
import AnalyticsFlow from "./components/analytics-flow"
import { FlowVersionsDialog } from "./components/flow-versions-dialog"
import { MessengerAdPayloadDialog } from "./components/messenger-ad-payload-dialog"
import { MessengerAdsJsonDialog } from "./components/messenger-ads-json-dialog"
import { RenameFlowDialog } from "./components/rename-flow"
import {
  isEditableTarget,
  isRedoShortcut,
  isUndoShortcut,
} from "./flow-edit-toolbar-keyboard"
import { resolveFlowValidationMessageKey } from "./flow-validation-message"
import { useFlowHistory } from "./stores/use-flow-history"

export function FlowEditToolbar({
  workspaceId,
  flow,
  canRevertToPublished,
  hasPublishedVersion,
  cancelAutosave,
  markSaved,
}: {
  workspaceId: string
  flow: FlowModel
  canRevertToPublished: boolean
  hasPublishedVersion: boolean
  cancelAutosave: (() => void) | null
  markSaved: ((nodes: Node[], edges: Edge[]) => void) | null
}) {
  const t = useTranslations()
  const router = useRouter()
  const lastBranchClearedCountRef = useRef(0)

  const [isValidating, setIsValidating] = useState<boolean>(false)
  const [action, setAction] = useState<
    | "publish"
    | "rename"
    | "duplicate"
    | "getDraftLink"
    | "getPublishedLink"
    | "getMessengerAdsJson"
    | "getMessengerAdPayload"
    | "analytics"
    | "flowVersions"
    | "delete"
    | "revertToPublished"
    | null
  >(null)

  // NOTES: DO NOT use useNodes & useEdges, it makes component re-render when node or edge is changed
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow()
  const {
    branchClearedCount,
    canUndo,
    canRedo,
    futureCount,
    pastCount,
    undo,
    redo,
    reset,
  } = useFlowHistory()

  const applyVersionToCanvas = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      const normalizedEdges = edges.map((edge) => ({
        ...edge,
        type: "buttonedge",
        markerEnd: { type: MarkerType.ArrowClosed },
      }))
      setNodes(nodes)
      setEdges(normalizedEdges)
      reset()
      markSaved?.(nodes, normalizedEdges)
    },
    [markSaved, reset, setEdges, setNodes],
  )

  useEffect(() => {
    if (branchClearedCount > lastBranchClearedCountRef.current) {
      toast.info(t("messages.redoHistoryCleared"))
    }
    lastBranchClearedCountRef.current = branchClearedCount
  }, [branchClearedCount, t])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if (isUndoShortcut(event)) {
        event.preventDefault()
        undo()
        return
      }

      if (isRedoShortcut(event)) {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [undo, redo])

  const { execute: executePublish, isPending: isPendingPublish } = useAction(
    publishFlowAction.bind(null, workspaceId, flow.id),
    {
      onSuccess: () => {
        toast.success(t("messages.publishVersionSuccess"))
        // Publishing makes the canvas the published version. Clear the dirty
        // baseline and refresh server state so gates that depend on
        // "published & clean" (the Messenger Ads JSON action, the revert
        // button) update immediately instead of staying stale until reload.
        markSaved?.(getNodes(), getEdges())
        router.refresh()
      },
    },
  )

  const { execute: executeRevert, isPending: isPendingRevert } = useAction(
    revertToPublishedAction.bind(null, workspaceId, flow.id),
    {
      onSuccess: ({ data }) => {
        if (data) {
          cancelAutosave?.()
          applyVersionToCanvas(data.nodes as Node[], data.edges as Edge[])
          toast.success(t("messages.revertToPublishedSuccess"))
          setAction(null)
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

  const onClickPublish = () => {
    setIsValidating(true)

    // validate nodes & edges
    const nodes = getNodes()
    const edges = getEdges()
    const validationResult = updateFlowVersionSchema.safeParse({
      nodes,
      edges,
    })

    if (validationResult.success) {
      executePublish({
        nodes: nodes as unknown as PublishFlowSchema["nodes"],
        edges: edges as unknown as PublishFlowSchema["edges"],
      })
    } else {
      toast.error(t(resolveFlowValidationMessageKey(validationResult.error)), {
        duration: 5000,
      })
    }
    setIsValidating(false)
  }

  const onClickGetMessengerAdsJson = () => {
    // The ad JSON must reflect a fully published flow. Detect "never published"
    // or "unpublished changes" client-side and surface it as a toast — no API
    // call, and no dialog flashing open before an error popup replaces it.
    if (!hasPublishedVersion || canRevertToPublished) {
      toast.error(t("messages.messengerAdsNotPublished"))
      return
    }
    setAction("getMessengerAdsJson")
  }

  return (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("actions.undo")}
              className="relative px-1.5"
              disabled={!canUndo}
              onClick={undo}
              size="sm"
              variant="ghost"
            >
              <RotateCcwIcon />
              {pastCount > 0 && (
                <Badge
                  className="absolute -end-1 -top-1 min-h-5 min-w-5 rounded-full px-1 text-[10px]"
                  variant="secondary"
                >
                  {pastCount}
                </Badge>
              )}
            </Button>
          }
        />
        <TooltipContent>
          <p>
            {t("actions.undo")}{" "}
            {t("messages.historyDepth", { count: pastCount })}
          </p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("actions.redo")}
              className="relative px-1.5"
              disabled={!canRedo}
              onClick={redo}
              size="sm"
              variant="ghost"
            >
              <RotateCwIcon />
              {futureCount > 0 && (
                <Badge
                  className="absolute -end-1 -top-1 min-h-5 min-w-5 rounded-full px-1 text-[10px]"
                  variant="secondary"
                >
                  {futureCount}
                </Badge>
              )}
            </Button>
          }
        />
        <TooltipContent>
          <p>
            {t("actions.redo")}{" "}
            {t("messages.historyDepth", { count: futureCount })}
          </p>
        </TooltipContent>
      </Tooltip>
      <Button
        className="ms-5"
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
        <DropdownMenuContent className="w-max whitespace-nowrap">
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
            <DropdownMenuItem onClick={onClickGetMessengerAdsJson}>
              <MegaphoneIcon />
              {t("actions.getMessengerAdsJson")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setAction("getMessengerAdPayload")}
            >
              <MegaphoneIcon />
              {t("actions.getMessengerAdPayload")}
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
            <DropdownMenuItem
              disabled={!canRevertToPublished}
              onClick={() => setAction("revertToPublished")}
            >
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
        onSuccess={(duplicatedFlowId) =>
          router.push(`/space/${workspaceId}/flows/${duplicatedFlowId}`)
        }
        open={action === "duplicate"}
        workspaceId={workspaceId}
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

      <MessengerAdsJsonDialog
        flowId={flow.id}
        onOpenChange={() => setAction(null)}
        open={action === "getMessengerAdsJson"}
        workspaceId={workspaceId}
      />

      <MessengerAdPayloadDialog
        flowId={flow.id}
        onOpenChange={() => setAction(null)}
        open={action === "getMessengerAdPayload"}
      />

      <FlowVersionsDialog
        flow={flow}
        onOpenChange={() => setAction(null)}
        onRestoreSuccess={(nodes, edges) => {
          applyVersionToCanvas(nodes as Node[], edges as Edge[])
        }}
        open={action === "flowVersions"}
        workspaceId={workspaceId}
      />

      {action === "analytics" && <AnalyticsFlow flow={flow} />}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setAction(null)
          }
        }}
        open={action === "revertToPublished"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("messages.revertToPublishedConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {t("messages.revertToPublishedConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPendingRevert}
              onClick={(event) => {
                event.preventDefault()
                executeRevert()
              }}
            >
              {isPendingRevert && <Loader2Icon className="animate-spin" />}
              {t("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

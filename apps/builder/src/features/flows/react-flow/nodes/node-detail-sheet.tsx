"use client"

import type { FlowNode, NodeType } from "@chatbotx.io/flow-config"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { useReactFlow, useStore } from "@xyflow/react"
import { LoaderCircleIcon } from "lucide-react"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { NodeEditor } from "./editor"
import { NodeNameEditor } from "./node-name-editor"
import {
  selectedNodeEqualityFn,
  selectSelectedNode,
} from "./selected-node-equality"

type NodeDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeDetailSheet({ open, onOpenChange }: NodeDetailSheetProps) {
  // Use store selector with custom equality function
  const activeNode = useStore(selectSelectedNode, selectedNodeEqualityFn)
  const { getNode } = useReactFlow()

  // Bump the editor key only on the discrete open transition so reopening a
  // node re-seeds from the latest flow data without disturbing typing.
  const prevOpenRef = useRef(false)
  const [openToken, setOpenToken] = useState(0)
  const isOpening = open && !prevOpenRef.current
  const renderToken = openToken + (isOpening ? 1 : 0)

  useEffect(() => {
    if (isOpening) {
      setOpenToken((token) => token + 1)
    }
    prevOpenRef.current = open
  }, [isOpening, open])

  const activeNodeId = activeNode?.id
  // Read the latest node data at open time instead of trusting the stale
  // id-only store snapshot.
  // biome-ignore lint/correctness/useExhaustiveDependencies: getNode is stable; re-read only on open/node changes
  const freshDetails = useMemo(
    () =>
      activeNodeId
        ? ((getNode(activeNodeId) as FlowNode | null)?.data.details ??
          activeNode?.data.details)
        : undefined,
    [activeNodeId, renderToken],
  )

  return open && activeNode && freshDetails !== undefined ? (
    <NodeDetailSheetContent
      activeNode={activeNode}
      freshDetails={freshDetails}
      onOpenChange={onOpenChange}
      open={open}
      openToken={renderToken}
    />
  ) : null
}

export const NodeDetailSheetContent = memo(
  ({
    activeNode,
    freshDetails,
    open,
    openToken,
    onOpenChange,
  }: {
    activeNode: FlowNode
    freshDetails: FlowNode["data"]["details"]
    open: boolean
    openToken: number
    onOpenChange: (open: boolean) => void
  }) => {
    // The editor upgrades legacy spreadsheet steps to variable tokens once, when
    // it seeds its form (and child editors capture their initial value). That
    // conversion needs the custom-field lookup, so wait until the store has
    // finished loading before mounting — `initialized` flips true after the
    // fetch settles (success or failure), so this never deadlocks.
    const customFieldsInitialized = useCustomFieldStore(
      (state) => state.initialized,
    )

    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent className="flex flex-col gap-0" side="left">
          <SheetTitle>
            <NodeNameEditor activeNode={activeNode} />
          </SheetTitle>
          <SheetDescription />
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
            {customFieldsInitialized ? (
              <NodeEditor
                key={`${activeNode.id}:${openToken}`}
                nodeDetails={freshDetails}
                nodeId={activeNode.id}
                nodeType={activeNode.type as NodeType}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  },
)

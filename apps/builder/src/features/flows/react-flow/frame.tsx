"use client"

import "@xyflow/react/dist/style.css"
import type { Edge, Node } from "@xyflow/react"
import { useCallback, useState } from "react"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import type { FlowResource } from "../schemas/resource"
import { ButtonEditorDialog } from "./button-editor-dialog"
import { FrameHeader } from "./frame-header"
import { NodeDetailSheet } from "./nodes/node-detail-sheet"
import { ReactFlowWrapper } from "./react-flow-wrapper"
import { FlowHistoryStoreProvider } from "./stores/flow-history-store-provider"
import { useStepStore } from "./stores/step-store-provider"

type ReactFlowFrameProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  canRevertToPublished: boolean
  hasPublishedVersion: boolean
}

export function ReactFlowFrame({
  flow,
  flowVersion,
  canRevertToPublished,
  hasPublishedVersion,
}: ReactFlowFrameProps) {
  const openNodeDetailSheet = useStepStore((state) => state.openNodeDetailSheet)
  const setOpenNodeDetailSheet = useStepStore(
    (state) => state.setOpenNodeDetailSheet,
  )
  const [flushAutosave, setFlushAutosave] = useState<(() => void) | null>(null)
  const [cancelAutosave, setCancelAutosave] = useState<(() => void) | null>(
    null,
  )
  const [draftDirtied, setDraftDirtied] = useState(false)
  const [markSaved, setMarkSaved] = useState<
    ((nodes: Node[], edges: Edge[]) => void) | null
  >(null)

  const handleAutosaveFlushChange = useCallback(
    (flush: (() => void) | null) => {
      setFlushAutosave(() => flush)
    },
    [],
  )

  const handleAutosaveCancelChange = useCallback(
    (cancel: (() => void) | null) => {
      setCancelAutosave(() => cancel)
    },
    [],
  )

  const handleMarkSavedChange = useCallback(
    (nextMarkSaved: ((nodes: Node[], edges: Edge[]) => void) | null) => {
      setMarkSaved(() => nextMarkSaved)
    },
    [],
  )

  const handleDraftDirtiedChange = useCallback((dirtied: boolean) => {
    setDraftDirtied(dirtied)
  }, [])

  const handleNodeDetailSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        flushAutosave?.()
      }

      setOpenNodeDetailSheet(open)
    },
    [flushAutosave, setOpenNodeDetailSheet],
  )

  return (
    <FlowHistoryStoreProvider key={flowVersion.id}>
      <FrameHeader
        cancelAutosave={cancelAutosave}
        canRevertToPublished={
          (canRevertToPublished || draftDirtied) && hasPublishedVersion
        }
        flow={flow}
        markSaved={markSaved}
      />

      <ReactFlowWrapper
        flowVersion={flowVersion}
        onAutosaveCancelChange={handleAutosaveCancelChange}
        onAutosaveFlushChange={handleAutosaveFlushChange}
        onDraftDirtiedChange={handleDraftDirtiedChange}
        onMarkSavedChange={handleMarkSavedChange}
        setOpenNodeDetailSheet={setOpenNodeDetailSheet}
      />

      <NodeDetailSheet
        onOpenChange={handleNodeDetailSheetOpenChange}
        open={openNodeDetailSheet}
      />

      <ButtonEditorDialog />
    </FlowHistoryStoreProvider>
  )
}

"use client"

import "@xyflow/react/dist/style.css"
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
}

export function ReactFlowFrame({ flow, flowVersion }: ReactFlowFrameProps) {
  const openNodeDetailSheet = useStepStore((state) => state.openNodeDetailSheet)
  const setOpenNodeDetailSheet = useStepStore(
    (state) => state.setOpenNodeDetailSheet,
  )
  const [flushAutosave, setFlushAutosave] = useState<(() => void) | null>(null)

  const handleAutosaveFlushChange = useCallback(
    (flush: (() => void) | null) => {
      setFlushAutosave(() => flush)
    },
    [],
  )

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
      <FrameHeader flow={flow} />

      <ReactFlowWrapper
        flowVersion={flowVersion}
        onAutosaveFlushChange={handleAutosaveFlushChange}
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

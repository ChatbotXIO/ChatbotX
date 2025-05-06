"use client"

import "@xyflow/react/dist/style.css"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { ButtonEditorDialog } from "./button-editor-dialog"
import { NodeDetailSheet } from "./nodes/node-detail-sheet"
import { useStepStore } from "./stores/step-store-provider"
import { FrameHeader } from "./frame-header"
import { ReactFlowWrapper } from "./react-flow-wrapper"

interface ReactFlowFrameProps {
  flowVersion: FlowVersionResource
}

export function ReactFlowFrame({ flowVersion }: ReactFlowFrameProps) {
  const { openNodeDetailSheet, setOpenNodeDetailSheet } = useStepStore(
    (state) => state,
  )

  return (
    <>
      <FrameHeader />

      <ReactFlowWrapper
        setOpenNodeDetailSheet={setOpenNodeDetailSheet}
        flowVersion={flowVersion}
      />

      <NodeDetailSheet
        open={openNodeDetailSheet}
        onOpenChange={setOpenNodeDetailSheet}
      />

      <ButtonEditorDialog />
    </>
  )
}

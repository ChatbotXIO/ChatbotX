"use client"

import "@xyflow/react/dist/style.css"
import type { FlowVersionResource } from "../schemas/get-flows-schema"
import { ButtonEditorDialog } from "./button-editor-dialog"
import { FrameHeader } from "./frame-header"
import { NodeDetailSheet } from "./nodes/node-detail-sheet"
import { ReactFlowWrapper } from "./react-flow-wrapper"
import { useStepStore } from "./stores/step-store-provider"

type ReactFlowFrameProps = {
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
        flowVersion={flowVersion}
        setOpenNodeDetailSheet={setOpenNodeDetailSheet}
      />

      <NodeDetailSheet
        onOpenChange={setOpenNodeDetailSheet}
        open={openNodeDetailSheet}
      />

      <ButtonEditorDialog />
    </>
  )
}

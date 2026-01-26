"use client"

import "@xyflow/react/dist/style.css"
import type { FlowResource, FlowVersionResource } from "../schemas/resource"
import { ButtonEditorDialog } from "./button-editor-dialog"
import { FrameHeader } from "./frame-header"
import { NodeDetailSheet } from "./nodes/node-detail-sheet"
import { ReactFlowWrapper } from "./react-flow-wrapper"
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

  return (
    <>
      <FrameHeader flow={flow} />

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

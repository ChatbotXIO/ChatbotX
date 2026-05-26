"use client"

import "@xyflow/react/dist/style.css"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import type { FlowResource } from "../schemas/resource"
import { ButtonEditorDialog } from "./button-editor-dialog"
import { FrameHeader } from "./frame-header"
import { NodeDetailPanel } from "./nodes/node-detail-panel"
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

      {/*
        Wrapper relative pra ancorar o painel não-modal (NodeDetailPanel) com
        `absolute right-0` dentro da área do canvas. `overflow-hidden` impede
        que o `translate-x-full` do painel (quando fechado) crie scroll
        horizontal no body. `min-w-0` impede que o canvas force largura > pai.
      */}
      <div className="relative flex-1 overflow-hidden">
        <ReactFlowWrapper
          flowVersion={flowVersion}
          setOpenNodeDetailSheet={setOpenNodeDetailSheet}
        />

        <NodeDetailPanel
          onOpenChange={setOpenNodeDetailSheet}
          open={openNodeDetailSheet}
        />
      </div>

      <ButtonEditorDialog />
    </>
  )
}

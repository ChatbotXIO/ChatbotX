"use client"

import {
  type PipelineStepSchema,
  pipelineActionCanSkip,
  stateTypes,
} from "@chatbotx.io/flow-config"
import { useNodeConnections } from "@xyflow/react"
import { SquareKanbanIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { usePipelineOptions } from "@/features/pipelines/lib/use-pipeline-options"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"
import { usePipelineActionLabel } from "./action-labels"

type PipelineState = PipelineStepSchema["states"][number]

/**
 * The skip handle of an action that never skips (e.g. "Add contact to
 * pipeline") is hidden — unless a flow made before this already connected it,
 * since removing a connected handle would orphan that edge.
 */
const UnreachableSkipState = ({ state }: { state: PipelineState }) => {
  const connections = useNodeConnections({
    handleType: "source",
    handleId: state.id,
  })
  return connections.length > 0 ? <BaseStateViewer data={state} /> : null
}

const PipelineStepViewer = ({ data }: { data: PipelineStepSchema }) => {
  const t = useTranslations()
  const actionLabel = usePipelineActionLabel()
  const { pipelines } = usePipelineOptions()
  const pipeline = pipelines.find((item) => item.id === data.pipelineId)

  return (
    <BaseStepViewer icon={SquareKanbanIcon} title={t("flows.actions.pipeline")}>
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          {actionLabel(data.action)}
          {pipeline ? ` · ${pipeline.name}` : ""}
        </p>
        <div className="my-1 me-3 flex flex-col gap-1">
          {data.states.map((state) =>
            state.stateType === stateTypes.skip &&
            !pipelineActionCanSkip(data.action) ? (
              <UnreachableSkipState key={state.id} state={state} />
            ) : (
              <BaseStateViewer data={state} key={state.id} />
            ),
          )}
        </div>
      </div>
    </BaseStepViewer>
  )
}

export default PipelineStepViewer

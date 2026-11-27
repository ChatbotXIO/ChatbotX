import {
  type PipelineStepSchema,
  pipelineStepDefaultFn,
  pipelineStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import PipelineStepEditor from "./editor"
import PipelineStepViewer from "./viewer"

export const pipelineStep: StepDefinition<PipelineStepSchema> = {
  defaultFn: () => pipelineStepDefaultFn(),
  editor: PipelineStepEditor,
  validator: pipelineStepSchema,
  viewer: PipelineStepViewer,
}

import {
  type MoosendStepSchema,
  moosendDefaultFn,
  moosendStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import MoosendStepEditor from "./editor"
import MoosendStepViewer from "./viewer"

export const moosendStep: StepDefinition<MoosendStepSchema> = {
  editor: MoosendStepEditor,
  viewer: MoosendStepViewer,
  validator: moosendStepSchema,
  defaultFn: moosendDefaultFn,
}

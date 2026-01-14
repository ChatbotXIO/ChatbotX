import {
  type DripStepSchema,
  dripDefaultFn,
  dripStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import DripStepEditor from "./editor"
import DripStepViewer from "./viewer"

export const dripStep: StepDefinition<DripStepSchema> = {
  editor: DripStepEditor,
  viewer: DripStepViewer,
  validator: dripStepSchema,
  defaultFn: dripDefaultFn,
}

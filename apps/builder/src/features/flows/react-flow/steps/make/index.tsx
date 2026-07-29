import {
  type MakeStepSchema,
  makeStepDefaultFn,
  makeStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import MakeStepEditor from "./editor"
import MakeStepViewer from "./viewer"

export const makeStep: StepDefinition<MakeStepSchema> = {
  editor: MakeStepEditor,
  viewer: MakeStepViewer,
  validator: makeStepSchema,
  defaultFn: makeStepDefaultFn,
}

import {
  type WaitStepSchema,
  waitStepDefaultFn,
  waitStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import WaitStepEditor from "./editor"
import WaitStepViewer from "./viewer"

export const waitStep: StepDefinition<WaitStepSchema> = {
  editor: WaitStepEditor,
  viewer: WaitStepViewer,
  validator: waitStepSchema,
  defaultFn: waitStepDefaultFn,
}

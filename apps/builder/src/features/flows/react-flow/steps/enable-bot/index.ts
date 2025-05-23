import {
  enableBotStepDefaultFn,
  enableBotStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { EnableBotStepEditor } from "./editor"
import { EnableBotStepViewer } from "./viewer"

export const enableBotStep: StepDefinition = {
  editor: EnableBotStepEditor,
  viewer: EnableBotStepViewer,
  validator: enableBotStepSchema,
  defaultFn: enableBotStepDefaultFn,
}

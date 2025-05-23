import type { StepDefinition } from ".."
import { DisableBotStepEditor } from "./editor"
import { DisableBotStepViewer } from "./viewer"
import {
  disableBotStepDefaultFn,
  disableBotStepSchema,
} from "@ahachat.ai/flow-config"

export const disableBotStep: StepDefinition = {
  editor: DisableBotStepEditor,
  viewer: DisableBotStepViewer,
  validator: disableBotStepSchema,
  defaultFn: disableBotStepDefaultFn,
}

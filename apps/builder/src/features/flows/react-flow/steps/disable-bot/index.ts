import {
  disableBotStepDefaultFn,
  disableBotStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { DisableBotStepEditor } from "./editor"
import { DisableBotStepViewer } from "./viewer"

export const disableBotStep: StepDefinition = {
  editor: DisableBotStepEditor,
  viewer: DisableBotStepViewer,
  validator: disableBotStepSchema,
  defaultFn: disableBotStepDefaultFn,
}

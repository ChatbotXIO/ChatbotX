import {
  type DisableBotStepSchema,
  disableBotStepDefaultFn,
  disableBotStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import DisableBotStepEditor from "./editor"
import DisableBotStepViewer from "./viewer"

export const disableBotStep: StepDefinition<DisableBotStepSchema> = {
  editor: DisableBotStepEditor,
  viewer: DisableBotStepViewer,
  validator: disableBotStepSchema,
  defaultFn: disableBotStepDefaultFn,
}

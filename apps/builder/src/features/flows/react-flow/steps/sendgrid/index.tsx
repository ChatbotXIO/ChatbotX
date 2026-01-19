import {
  type SendGridStepSchema,
  sendGridDefaultFn,
  sendGridStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendGridStepEditor from "./editor"
import SendGridStepViewer from "./viewer"

export const sendGridStep: StepDefinition<SendGridStepSchema> = {
  editor: SendGridStepEditor,
  viewer: SendGridStepViewer,
  validator: sendGridStepSchema,
  defaultFn: sendGridDefaultFn,
}

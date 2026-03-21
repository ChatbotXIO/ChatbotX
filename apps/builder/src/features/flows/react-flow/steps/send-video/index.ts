import {
  type SendVideoStepSchema,
  sendVideoStepDefaultFn,
  sendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendVideoStepEditor from "./editor"
import SendVideoStepViewer from "./viewer"

export const sendVideoStep: StepDefinition<SendVideoStepSchema> = {
  editor: SendVideoStepEditor,
  viewer: SendVideoStepViewer,
  validator: sendVideoStepSchema,
  defaultFn: sendVideoStepDefaultFn,
}

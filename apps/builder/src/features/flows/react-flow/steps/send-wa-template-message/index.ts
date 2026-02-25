import {
  type SendWaTemplateMessageStepSchema,
  sendWaTemplateMessageStepDefaultFn,
  sendWaTemplateMessageStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendWaTemplateMessageStepEditor from "./editor"
import { SendWaTemplateMessageStepViewer } from "./viewer"

const sendWaTemplateMessageStep: StepDefinition<SendWaTemplateMessageStepSchema> =
  {
    editor: SendWaTemplateMessageStepEditor,
    viewer: SendWaTemplateMessageStepViewer,
    validator: sendWaTemplateMessageStepSchema,
    defaultFn: sendWaTemplateMessageStepDefaultFn,
  }

export default sendWaTemplateMessageStep

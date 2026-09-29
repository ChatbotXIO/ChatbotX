import {
  type WhatsappCallButtonStepSchema,
  whatsappCallButtonStepDefaultFn,
  whatsappCallButtonStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import WhatsappCallButtonStepEditor from "./editor"
import WhatsappCallButtonStepViewer from "./viewer"

const whatsappCallButtonStep: StepDefinition<WhatsappCallButtonStepSchema> = {
  editor: WhatsappCallButtonStepEditor,
  viewer: WhatsappCallButtonStepViewer,
  validator: whatsappCallButtonStepSchema,
  defaultFn: whatsappCallButtonStepDefaultFn,
}

export default whatsappCallButtonStep

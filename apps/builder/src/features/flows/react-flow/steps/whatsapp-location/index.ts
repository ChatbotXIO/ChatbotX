import {
  type WhatsappLocationStepSchema,
  whatsappLocationStepDefaultFn,
  whatsappLocationStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import WhatsappLocationStepEditor from "./editor"
import WhatsappLocationStepViewer from "./viewer"

const whatsappLocationStep: StepDefinition<WhatsappLocationStepSchema> = {
  editor: WhatsappLocationStepEditor,
  viewer: WhatsappLocationStepViewer,
  validator: whatsappLocationStepSchema,
  defaultFn: whatsappLocationStepDefaultFn,
}

export default whatsappLocationStep

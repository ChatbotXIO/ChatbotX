import {
  type WhatsappOptionListStepSchema,
  whatsappOptionListStepDefaultFn,
  whatsappOptionListStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import WhatsappOptionListStepEditor from "./editor"
import WhatsappOptionListStepViewer from "./viewer"

const whatsappOptionListStep: StepDefinition<WhatsappOptionListStepSchema> = {
  editor: WhatsappOptionListStepEditor,
  viewer: WhatsappOptionListStepViewer,
  validator: whatsappOptionListStepSchema,
  defaultFn: whatsappOptionListStepDefaultFn,
}

export default whatsappOptionListStep

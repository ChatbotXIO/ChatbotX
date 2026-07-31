import {
  type SendCarouselStepSchema,
  sendCarouselStepDefaultFn,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendCarouselStepEditor from "./editor"
import { sendCarouselValidator } from "./validator"
import SendCarouselStepViewer from "./viewer"

export const sendCarouselStep: StepDefinition<SendCarouselStepSchema> = {
  editor: SendCarouselStepEditor,
  viewer: SendCarouselStepViewer,
  validator: sendCarouselValidator,
  defaultFn: sendCarouselStepDefaultFn,
}

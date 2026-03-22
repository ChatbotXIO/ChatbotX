import {
  type SendCarouselStepSchema,
  sendCarouselStepDefaultFn,
  sendCarouselStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendCarouselStepEditor from "./editor"
import SendCarouselStepViewer from "./viewer"

export const sendCarouselStep: StepDefinition<SendCarouselStepSchema> = {
  editor: SendCarouselStepEditor,
  viewer: SendCarouselStepViewer,
  validator: sendCarouselStepSchema,
  defaultFn: sendCarouselStepDefaultFn,
}

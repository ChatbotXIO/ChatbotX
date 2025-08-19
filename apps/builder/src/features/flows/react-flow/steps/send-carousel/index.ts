import {
  sendCarouselStepDefaultFn,
  sendCarouselStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SendCarouselStepEditor } from "./editor"
import { SendCarouselStepViewer } from "./viewer"

export const sendCarouselStep: StepDefinition = {
  editor: SendCarouselStepEditor,
  viewer: SendCarouselStepViewer,
  validator: sendCarouselStepSchema,
  defaultFn: sendCarouselStepDefaultFn,
}

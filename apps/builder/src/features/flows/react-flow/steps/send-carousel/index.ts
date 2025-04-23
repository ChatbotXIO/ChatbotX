import type { StepDefinition } from ".."
import { SendCarouselStepEditor } from "./editor"
import { sendCarouselStepSchema, sendCarouselStepDefaultFn } from "./schema"
import { SendCarouselStepViewer } from "./viewer"

export const sendCarouselStep: StepDefinition = {
  editor: SendCarouselStepEditor,
  viewer: SendCarouselStepViewer,
  validator: sendCarouselStepSchema,
  defaultFn: sendCarouselStepDefaultFn,
}

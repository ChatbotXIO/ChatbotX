import type { StepDefinition } from ".."
import { SendCarouselStepEditor } from "./editor"
import {
  sendCarouselStepSchema,
  sendCarouselStepDefaultFn,
} from "@ahachat.ai/flow-config"
import { SendCarouselStepViewer } from "./viewer"

export const sendCarouselStep: StepDefinition = {
  editor: SendCarouselStepEditor,
  viewer: SendCarouselStepViewer,
  validator: sendCarouselStepSchema,
  defaultFn: sendCarouselStepDefaultFn,
}

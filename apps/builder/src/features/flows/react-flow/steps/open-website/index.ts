import {
  openWebsiteStepDefaultFn,
  openWebsiteStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { OpenWebsiteStepEditor } from "./editor"
import { OpenWebsiteStepViewer } from "./viewer"

export const openWebsiteStep: StepDefinition = {
  editor: OpenWebsiteStepEditor,
  viewer: OpenWebsiteStepViewer,
  validator: openWebsiteStepSchema,
  defaultFn: openWebsiteStepDefaultFn,
}

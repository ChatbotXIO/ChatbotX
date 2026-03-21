import {
  type OpenWebsiteStepSchema,
  openWebsiteStepDefaultFn,
  openWebsiteStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import OpenWebsiteStepEditor from "./editor"
import OpenWebsiteStepViewer from "./viewer"

export const openWebsiteStep: StepDefinition<OpenWebsiteStepSchema> = {
  editor: OpenWebsiteStepEditor,
  viewer: OpenWebsiteStepViewer,
  validator: openWebsiteStepSchema,
  defaultFn: openWebsiteStepDefaultFn,
}

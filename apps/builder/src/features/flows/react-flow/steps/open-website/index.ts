import {
  type OpenWebsiteStepSchema,
  openWebsiteStepDefaultFn,
  openWebsiteStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import OpenWebsiteStepEditor from "./editor"
import OpenWebsiteStepViewer from "./viewer"

export const openWebsiteStep: StepDefinition<OpenWebsiteStepSchema> = {
  editor: OpenWebsiteStepEditor,
  viewer: OpenWebsiteStepViewer,
  validator: openWebsiteStepSchema,
  defaultFn: openWebsiteStepDefaultFn,
}

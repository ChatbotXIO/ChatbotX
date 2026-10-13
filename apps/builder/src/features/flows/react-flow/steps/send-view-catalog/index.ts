import {
  type SendViewCatalogStepSchema,
  sendViewCatalogStepDefaultFn,
  sendViewCatalogStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendViewCatalogStepEditor from "./editor"
import SendViewCatalogStepViewer from "./viewer"

const sendViewCatalogStep: StepDefinition<SendViewCatalogStepSchema> = {
  editor: SendViewCatalogStepEditor,
  viewer: SendViewCatalogStepViewer,
  validator: sendViewCatalogStepSchema,
  defaultFn: sendViewCatalogStepDefaultFn,
}

export default sendViewCatalogStep

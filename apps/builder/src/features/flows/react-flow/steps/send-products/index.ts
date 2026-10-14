import {
  type SendProductsStepSchema,
  sendProductsStepDefaultFn,
  sendProductsValidator,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendProductsStepEditor from "./editor"
import SendProductsStepViewer from "./viewer"

const sendProductsStep: StepDefinition<SendProductsStepSchema> = {
  editor: SendProductsStepEditor,
  viewer: SendProductsStepViewer,
  validator: sendProductsValidator,
  defaultFn: sendProductsStepDefaultFn,
}

export default sendProductsStep

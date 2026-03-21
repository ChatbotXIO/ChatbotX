import {
  type EmailImageStepSchema,
  emailImageStepDefaultFn,
  emailImageStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import EmailImageStepEditor from "./editor"
import EmailImageStepViewer from "./viewer"

const emailImageStep: StepDefinition<EmailImageStepSchema> = {
  editor: EmailImageStepEditor,
  viewer: EmailImageStepViewer,
  validator: emailImageStepSchema,
  defaultFn: emailImageStepDefaultFn,
}

export default emailImageStep

import {
  type EmailStepSchema,
  emailStepDefaultFn,
  emailStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import EmailStepEditor from "./editor"
import EmailStepViewer from "./viewer"

const emailStep: StepDefinition<EmailStepSchema> = {
  editor: EmailStepEditor,
  viewer: EmailStepViewer,
  validator: emailStepSchema,
  defaultFn: emailStepDefaultFn,
}

export default emailStep

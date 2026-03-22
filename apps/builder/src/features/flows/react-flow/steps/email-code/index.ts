import {
  type EmailCodeStepSchema,
  emailCodeStepDefaultFn,
  emailCodeStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailCodeStepEditor from "./editor"
import EmailCodeStepViewer from "./viewer"

const emailCodeStep: StepDefinition<EmailCodeStepSchema> = {
  editor: EmailCodeStepEditor,
  viewer: EmailCodeStepViewer,
  validator: emailCodeStepSchema,
  defaultFn: emailCodeStepDefaultFn,
}

export default emailCodeStep

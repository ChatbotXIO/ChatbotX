import {
  type EmailHeaderStepSchema,
  emailHeaderStepDefaultFn,
  emailHeaderStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailHeaderStepEditor from "./editor"
import EmailHeaderStepViewer from "./viewer"

const emailHeaderStep: StepDefinition<EmailHeaderStepSchema> = {
  editor: EmailHeaderStepEditor,
  viewer: EmailHeaderStepViewer,
  validator: emailHeaderStepSchema,
  defaultFn: emailHeaderStepDefaultFn,
}

export default emailHeaderStep

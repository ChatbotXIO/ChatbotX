import {
  type UpdateMessengerContactDataStepSchema,
  updateMessengerContactDataStepDefaultFn,
  updateMessengerContactDataStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import UpdateMessengerContactDataStepEditor from "./editor"
import UpdateMessengerContactDataStepViewer from "./viewer"

export const updateMessengerContactDataStep: StepDefinition<UpdateMessengerContactDataStepSchema> =
  {
    editor: UpdateMessengerContactDataStepEditor,
    viewer: UpdateMessengerContactDataStepViewer,
    validator: updateMessengerContactDataStepSchema,
    defaultFn: updateMessengerContactDataStepDefaultFn,
  }

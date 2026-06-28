import {
  type SetMessengerPersonaStepSchema,
  setMessengerPersonaStepDefaultFn,
  setMessengerPersonaStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SetMessengerPersonaStepEditor from "./editor"
import SetMessengerPersonaStepViewer from "./viewer"

export const setMessengerPersonaStep: StepDefinition<SetMessengerPersonaStepSchema> =
  {
    editor: SetMessengerPersonaStepEditor,
    viewer: SetMessengerPersonaStepViewer,
    validator: setMessengerPersonaStepSchema,
    defaultFn: setMessengerPersonaStepDefaultFn,
  }

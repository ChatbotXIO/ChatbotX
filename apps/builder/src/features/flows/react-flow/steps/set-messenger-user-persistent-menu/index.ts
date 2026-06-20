import {
  type SetMessengerUserPersistentMenuStepSchema,
  setMessengerUserPersistentMenuStepDefaultFn,
  setMessengerUserPersistentMenuStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SetMessengerUserPersistentMenuStepEditor from "./editor"
import SetMessengerUserPersistentMenuStepViewer from "./viewer"

export const setMessengerUserPersistentMenuStep: StepDefinition<SetMessengerUserPersistentMenuStepSchema> =
  {
    editor: SetMessengerUserPersistentMenuStepEditor,
    viewer: SetMessengerUserPersistentMenuStepViewer,
    validator: setMessengerUserPersistentMenuStepSchema,
    defaultFn: setMessengerUserPersistentMenuStepDefaultFn,
  }

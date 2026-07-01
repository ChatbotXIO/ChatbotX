import {
  type EnableMessengerComposerStepSchema,
  enableMessengerComposerStepDefaultFn,
  enableMessengerComposerStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import EnableMessengerComposerStepEditor from "./editor"
import EnableMessengerComposerStepViewer from "./viewer"

export const enableMessengerComposerStep: StepDefinition<EnableMessengerComposerStepSchema> =
  {
    editor: EnableMessengerComposerStepEditor,
    viewer: EnableMessengerComposerStepViewer,
    validator: enableMessengerComposerStepSchema,
    defaultFn: enableMessengerComposerStepDefaultFn,
  }

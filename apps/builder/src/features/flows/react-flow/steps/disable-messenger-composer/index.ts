import {
  type DisableMessengerComposerStepSchema,
  disableMessengerComposerStepDefaultFn,
  disableMessengerComposerStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import DisableMessengerComposerStepEditor from "./editor"
import DisableMessengerComposerStepViewer from "./viewer"

export const disableMessengerComposerStep: StepDefinition<DisableMessengerComposerStepSchema> =
  {
    editor: DisableMessengerComposerStepEditor,
    viewer: DisableMessengerComposerStepViewer,
    validator: disableMessengerComposerStepSchema,
    defaultFn: disableMessengerComposerStepDefaultFn,
  }

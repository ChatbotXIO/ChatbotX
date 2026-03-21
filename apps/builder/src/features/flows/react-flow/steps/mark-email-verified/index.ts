import {
  type MarkEmailVerifiedStepSchema,
  markEmailVerifiedStepDefaultFn,
  markEmailVerifiedStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import MarkEmailVerifiedStepEditor from "./editor"
import MarkEmailVerifiedStepViewer from "./viewer"

export const markEmailVerifiedStep: StepDefinition<MarkEmailVerifiedStepSchema> =
  {
    editor: MarkEmailVerifiedStepEditor,
    viewer: MarkEmailVerifiedStepViewer,
    validator: markEmailVerifiedStepSchema,
    defaultFn: markEmailVerifiedStepDefaultFn,
  }

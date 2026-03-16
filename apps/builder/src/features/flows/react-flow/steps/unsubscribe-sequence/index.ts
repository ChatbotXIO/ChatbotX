import {
  type UnsubscribeSequenceStepSchema,
  unsubscribeSequenceStepDefaultFn,
  unsubscribeSequenceStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import UnsubscribeSequenceStepEditor from "./editor"
import UnsubscribeSequenceStepViewer from "./viewer"

export const unsubscribeSequenceStep: StepDefinition<UnsubscribeSequenceStepSchema> =
  {
    editor: UnsubscribeSequenceStepEditor,
    viewer: UnsubscribeSequenceStepViewer,
    validator: unsubscribeSequenceStepSchema,
    defaultFn: unsubscribeSequenceStepDefaultFn,
  }

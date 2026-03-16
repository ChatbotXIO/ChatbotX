import {
  type SubscribeSequenceStepSchema,
  subscribeSequenceStepDefaultFn,
  subscribeSequenceStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SubscribeSequenceStepEditor from "./editor"
import SubscribeSequenceStepViewer from "./viewer"

export const subscribeSequenceStep: StepDefinition<SubscribeSequenceStepSchema> =
  {
    editor: SubscribeSequenceStepEditor,
    viewer: SubscribeSequenceStepViewer,
    validator: subscribeSequenceStepSchema,
    defaultFn: subscribeSequenceStepDefaultFn,
  }

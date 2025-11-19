import {
  type SubscribeBroadcastStepSchema,
  subscribeBroadcastStepDefaultFn,
  subscribeBroadcastStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SubscribeBroadcastStepEditor from "./editor"
import SubscribeBroadcastStepViewer from "./viewer"

export const subscribeBroadcastStep: StepDefinition<SubscribeBroadcastStepSchema> =
  {
    editor: SubscribeBroadcastStepEditor,
    viewer: SubscribeBroadcastStepViewer,
    validator: subscribeBroadcastStepSchema,
    defaultFn: subscribeBroadcastStepDefaultFn,
  }

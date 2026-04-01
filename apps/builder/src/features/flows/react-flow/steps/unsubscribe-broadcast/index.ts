import {
  type UnsubscribeBroadcastStepSchema,
  unsubscribeBroadcastStepDefaultFn,
  unsubscribeBroadcastStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import UnsubscribeBroadcastStepEditor from "./editor"
import UnsubscribeBroadcastStepViewer from "./viewer"

export const unsubscribeBroadcastStep: StepDefinition<UnsubscribeBroadcastStepSchema> =
  {
    editor: UnsubscribeBroadcastStepEditor,
    viewer: UnsubscribeBroadcastStepViewer,
    validator: unsubscribeBroadcastStepSchema,
    defaultFn: unsubscribeBroadcastStepDefaultFn,
  }

import {
  type KlaviyoStepSchema,
  klaviyoDefaultFn,
  klaviyoStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import KlaviyoStepEditor from "./editor"
import KlaviyoStepViewer from "./viewer"

export const klaviyoStep: StepDefinition<KlaviyoStepSchema> = {
  editor: KlaviyoStepEditor,
  viewer: KlaviyoStepViewer,
  validator: klaviyoStepSchema,
  defaultFn: klaviyoDefaultFn,
}

import {
  type FacebookCustomAudienceSchema,
  facebookCustomAudienceDefaultFn,
  facebookCustomAudienceSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import FacebookCustomAudienceStepEditor from "./editor"
import FacebookCustomAudienceViewer from "./viewer"

export const facebookCustomAudienceStep: StepDefinition<FacebookCustomAudienceSchema> =
  {
    editor: FacebookCustomAudienceStepEditor,
    viewer: FacebookCustomAudienceViewer,
    validator: facebookCustomAudienceSchema,
    defaultFn: facebookCustomAudienceDefaultFn,
  }

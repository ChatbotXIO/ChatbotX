import {
  type FindPlacesNearMeStepSchema,
  findPlacesNearMeStepDefaultFn,
  findPlacesNearMeStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import FindPlacesNearMeStepEditor from "./editor"
import FindPlacesNearMeStepViewer from "./viewer"

export const findPlacesNearMeStep: StepDefinition<FindPlacesNearMeStepSchema> =
  {
    editor: FindPlacesNearMeStepEditor,
    viewer: FindPlacesNearMeStepViewer,
    validator: findPlacesNearMeStepSchema,
    defaultFn: findPlacesNearMeStepDefaultFn,
  }

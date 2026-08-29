import {
  type TrackAdsPurchaseSchema,
  trackAdsPurchaseDefaultFn,
  trackAdsPurchaseSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { TrackAdsPurchaseEditor } from "./editor"
import TrackAdsPurchaseViewer from "./viewer"

export const trackAdsPurchaseStep: StepDefinition<TrackAdsPurchaseSchema> = {
  editor: TrackAdsPurchaseEditor,
  viewer: TrackAdsPurchaseViewer,
  validator: trackAdsPurchaseSchema,
  defaultFn: trackAdsPurchaseDefaultFn,
}

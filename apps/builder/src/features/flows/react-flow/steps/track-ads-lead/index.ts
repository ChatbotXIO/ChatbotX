import {
  type TrackAdsLeadSchema,
  trackAdsLeadDefaultFn,
  trackAdsLeadSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { TrackAdsLeadEditor } from "./editor"
import TrackAdsLeadViewer from "./viewer"

export const trackAdsLeadStep: StepDefinition<TrackAdsLeadSchema> = {
  editor: TrackAdsLeadEditor,
  viewer: TrackAdsLeadViewer,
  validator: trackAdsLeadSchema,
  defaultFn: trackAdsLeadDefaultFn,
}

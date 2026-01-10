import {
  type ActiveCampaignStepSchema,
  activeCampaignDefaultFn,
  activeCampaignStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import ActiveCampaignStepEditor from "./editor"
import ActiveCampaignStepViewer from "./viewer"

export const activeCampaignStep: StepDefinition<ActiveCampaignStepSchema> = {
  editor: ActiveCampaignStepEditor,
  viewer: ActiveCampaignStepViewer,
  validator: activeCampaignStepSchema,
  defaultFn: activeCampaignDefaultFn,
}

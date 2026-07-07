import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"

export type BroadcastAudienceInput = {
  workspaceId: string
  channels?: ChannelType[] | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  contactFilter?: ContactFilterCriteriaInput | null
  subaction?: BroadcastSubaction | null
}
